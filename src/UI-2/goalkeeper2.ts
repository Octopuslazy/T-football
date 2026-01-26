import * as PIXI from 'pixi.js';
import { GAME_CONFIG, BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

// Simple static goalkeeper sprite for Other mode.
export default class Goalkeeper2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _frameSprite?: PIXI.Sprite | null = null;
  private _onResize: () => void;
  private _pointerDownPos: { x: number; y: number } | null = null;
  private _isAnimating: boolean = false;
  private _homeX: number = 0;
  private _homeY: number = 0;
  private _isDown: boolean = false;
  private _fallAnimHandle: any = null;
  private _currentTargetIndex: number | null = null;
  private _isDragging: boolean = false;
  private _dragTime: number = 0;
  private _startPos: { x: number; y: number } = { x: 0, y: 0 };

  private _targets = [
          { x: 0.228, y: 0.75 },
          { x: 0.78, y: 0.75 },
          { x: 0.33, y: 0.69 },
          { x: 0.66, y: 0.69 },
          { x: 0.228, y: 0.63 },
          { x: 0.50, y: 0.63 },
          { x: 0.78, y: 0.63 },
  ];
  // Optional per-target rotation overrides (radians). If a slot is null, fallback to computed rotation.
  private _targetRotations: Array<number|null> = [];

  constructor() {
    super();
    const tex = PIXI.Texture.from('./arts/gkeeper.png');
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5, 1); // anchor bottom-center so feet align
    this.addChild(this.sprite);

    // make interactive to receive pointer events for swipe
    this.interactive = true;
    this.cursor = 'pointer';
    this.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this.onDragStart(e));
    this.on('pointermove', (e: PIXI.FederatedPointerEvent) => this.onDragMove(e));
    this.on('pointerup', (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    this.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);

    this.resize();
    // Default per-target rotations (degrees) mapped to internal targets [0..6]
    // Order: [idx0,bottom-left, idx1,bottom-right, idx2,middle-left, idx3,middle-right, idx4,top-left, idx5,top-center, idx6,top-right]
    try { this.setAllTargetRotations([-90, 90, -45, 45, -60, 0, 60]); } catch (e) {}
  }

  // Allow external code to provide the goal frame sprite so we can size
  // the goalkeeper relative to the visible goal frame (keep keeper <= 2/3 frame height)
  public setFrameSprite(frame: PIXI.Sprite | null) {
    this._frameSprite = frame || null;
    this.resize();
  }

  // multiplier applied to calculated scale (1 = no change, <1 smaller, >1 larger)
  private _scaleMultiplier: number = 0.45;
  // vertical position as fraction of window height (0..1)
  private _verticalOffset: number = 0.78;

  // Public API to adjust size and vertical placement
  public setScaleMultiplier(v: number) {
    this._scaleMultiplier = Math.max(0.05, v || 1);
    this.resize();
  }

  // Multiplier applied to movement durations (1 = default speed).
  // Values >1 make motions slower (longer durations); values <1 make them faster.
  private _moveDurationMultiplier: number = 0.70;

  public setMoveDurationMultiplier(m: number) {
    if (typeof m !== 'number' || !isFinite(m)) return;
    this._moveDurationMultiplier = Math.max(0.1, m);
  }

  public setVerticalOffset(fraction: number) {
    if (typeof fraction !== 'number') return;
    this._verticalOffset = Math.max(0, Math.min(1, fraction));
    this.resize();
  }

  // expose whether goalkeeper is currently performing an animation (catching)
  public get isAnimating(): boolean {
    return this._isAnimating;
  }

  // expose which normalized target index the keeper moved to (or null)
  public get currentTargetIndex(): number | null {
    return this._currentTargetIndex;
  }

  private resize() {
    const w = BASE_WIDTH;
    const h = BASE_HEIGHT;

    // place horizontally centered, vertically using logical design fraction
    this.x = w / 2;
    this.y = h * this._verticalOffset;

    // store home position
    this._homeX = this.x;
    this._homeY = this.y;

    // scale sprite relative to screen width (make goalkeeper look proportionate)
    const desiredWidth = Math.max(120, Math.round(w * 0.22));
    const tex = this.sprite.texture;
    let s = 0.5 * this._scaleMultiplier;
    if (tex && tex.width) {
      s = (desiredWidth / tex.width) * this._scaleMultiplier;
    }

    // If we have a frame sprite available, cap keeper height to 2/3 of frame height
    try {
      if (this._frameSprite && this._frameSprite.texture) {
        const frameDisplayedH = (this._frameSprite.height && this._frameSprite.height > 0) ? this._frameSprite.height : ((this._frameSprite.texture as any).height || 1) * (this._frameSprite.scale?.y || 1);
        const texH = (tex && tex.height) ? tex.height : (this.sprite.height || 100);
        if (frameDisplayedH > 0 && texH > 0) {
          const maxScale = (frameDisplayedH * (2 / 3)) / texH;
          s = Math.min(s, maxScale * 0.95);
        }
      }
    } catch (e) {}

    this.sprite.scale.set(s, s);
  }

  public refresh() {
    this.resize();
  }

  // Perform a fall-down animation: lean and move downward, then remain down until reset.
  // If `groundY` is provided, align keeper to that world Y when finishing the fall.
  public fallDown(groundY?: number) {
    try {
      // cancel any existing fall animation
      if (this._fallAnimHandle) { cancelAnimationFrame(this._fallAnimHandle); this._fallAnimHandle = null; }
      const startY = this.y;
      const startRot = this.sprite ? this.sprite.rotation || 0 : 0;
      const drop = Math.max(60, Math.min(140, Math.round(Math.abs(startY - this._homeY) * 0.6)));
      let targetY = (typeof groundY === 'number') ? groundY : (startY + drop);
      // If no explicit groundY provided, compute a reasonable frame bottom and
      // ensure keeper doesn't fall below it (prevent visual sinking then bouncing).
      if (typeof groundY !== 'number') {
        try {
          const frameBottom = this._computeGoalFrameBottomY();
          if (frameBottom != null) {
            // match ball's groundFactor default (~0.95) so keeper lines up visually
            const maxGround = frameBottom * 0.95;
            if (targetY > maxGround) targetY = maxGround;
          }
        } catch (e) {}
      }
      // Never move the keeper upward when asked to fall: only animate when targetY > startY
      if (targetY <= startY) {
        // snap rotation to flat and mark as down without moving up
        try {
          if (this.sprite) {
            // preserve no-rotation for zone 5 (internal index 4)
            if (this._currentTargetIndex === 5) this.sprite.rotation = startRot;
            else this.sprite.rotation = (startRot >= 0) ? Math.PI / 2 : -Math.PI / 2;
          }
        } catch (e) {}
        this._isAnimating = false;
        this._isDown = true;
        // ensure y is not raised
        if (this.y > targetY) this.y = targetY;
        return;
      }
      // fall to lie flat: choose ±90 degrees (PI/2) based on current tilt sign
      const FLAT_ANGLE = Math.PI / 2;
      let targetRot = (startRot >= 0) ? FLAT_ANGLE : -FLAT_ANGLE;
      // preserve no-rotation for zone 5 (internal index 4)
      try { if (this._currentTargetIndex === 5) targetRot = startRot; } catch (e) {}
      let dur = 400;
      try {
        // slow down fall animation for zones 3 and 4 (indices 2 and 3)
        if (this._currentTargetIndex === 3 || this._currentTargetIndex === 4) {
          dur = Math.round(dur * 1.8);
        }
        if (this._currentTargetIndex === 1 || this._currentTargetIndex === 2 || this._currentTargetIndex === 6) {
          dur = Math.round(dur * 1.8);
        }
      } catch (e) {}
      const t0 = performance.now();
      const step = (now: number) => {
        const tt = Math.min(1, (now - t0) / dur);
        const ease = tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt;
        this.y = startY + (targetY - startY) * ease;
        try { if (this.sprite) this.sprite.rotation = startRot + (targetRot - startRot) * ease; } catch (e) {}
        if (tt < 1) this._fallAnimHandle = requestAnimationFrame(step);
        else {
          this._fallAnimHandle = null;
          this._isAnimating = false; // no longer actively trying to catch
          this._isDown = true;
        }
      };
      this._fallAnimHandle = requestAnimationFrame(step);
    } catch (e) { this._isAnimating = false; this._isDown = true; }
  }

  // Immediately reset keeper to home (used when ball resets)
  public resetToHomeImmediate() {
    try {
      if (this._fallAnimHandle) { cancelAnimationFrame(this._fallAnimHandle); this._fallAnimHandle = null; }
      try { this.sprite.texture = PIXI.Texture.from('./arts/gkeeper.png'); } catch (e) {}
      if (this.sprite) this.sprite.rotation = 0;
      this.x = this._homeX;
      this.y = this._homeY;
      this._isAnimating = false;
      this._isDown = false;
      this._currentTargetIndex = null;
    } catch (e) {}
  }

  // Public API: set rotation (degrees) for a specific target index.
  public setTargetRotation(index: number, degrees: number | null) {
    try {
      if (typeof index !== 'number' || index < 0 || index >= this._targets.length) return;
      if (!this._targetRotations) this._targetRotations = [];
      this._targetRotations[index] = (degrees === null) ? null : (degrees * Math.PI / 180);
    } catch (e) {}
  }

  // Public API: bulk set rotations (degrees). Array length should match targets; use null to clear.
  public setAllTargetRotations(degreesArr: Array<number|null>) {
    try {
      this._targetRotations = degreesArr.map(d => d === null ? null : (d * Math.PI / 180));
    } catch (e) { this._targetRotations = []; }
  }

  // Get configured rotation (radians) for a target index, or null if none
  public getTargetRotation(index: number): number | null {
    try { return (this._targetRotations && this._targetRotations[index] != null) ? this._targetRotations[index] : null; } catch (e) { return null; }
  }

  // Return the current head position in container (world) coordinates when animating.
  // Returns null if not animating or on error.
  public getActiveHeadPosition(): { x: number; y: number } | null {
    try {
      if (!this._isAnimating) return null;
      return this._getHeadWorldPos(this.x, this.y, this.sprite.rotation || 0);
    } catch (e) { return null; }
  }

  private onDragStart(event: PIXI.FederatedPointerEvent) {
    // Block player input until app's zoom/pivot sequence finishes in goalkeeper mode.
    try { if ((window as any).__keeperModeZooming) return; } catch (e) {}
    try {
      const hb = document.getElementById('home-btn') as HTMLButtonElement | null;
      if (hb && hb.disabled) return;
    } catch (e) {}
    if (this._isAnimating) return;
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
  }

  private onDragMove(event: PIXI.FederatedPointerEvent) {
    // optional: could show preview or adjust sprite while dragging
    try { if ((window as any).__keeperModeZooming) return; } catch (e) {}
    try {
      const hb = document.getElementById('home-btn') as HTMLButtonElement | null;
      if (hb && hb.disabled) return;
    } catch (e) {}
    if (!this._isDragging || this._isAnimating) return;
  }

  private onDragEnd(event: PIXI.FederatedPointerEvent) {
    try { if ((window as any).__keeperModeZooming) return; } catch (e) {}
    try {
      const hb = document.getElementById('home-btn') as HTMLButtonElement | null;
      if (hb && hb.disabled) return;
    } catch (e) {}
    if (!this._isDragging || this._isAnimating) return;
    this._isDragging = false;
    const endPos = { x: event.global.x, y: event.global.y };

    const dx = endPos.x - this._startPos.x;
    const dy = endPos.y - this._startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const dragDuration = Math.max(1, Date.now() - this._dragTime);

    // swipe speed (pixels per second)
    const swipePps = distance * 100 / dragDuration;
    const maxSwipeSpeed = 100;
    const minSwipeSpeed = 40;
    const powerPercent = Math.max(0, Math.min(100, ((swipePps - minSwipeSpeed) / (maxSwipeSpeed - minSwipeSpeed)) * 100));

    // Allow even small/weak gestures to produce movement — comment out guard
    // if (distance < 10 || powerPercent < 5) return; // ignore tiny/weak gestures

    // choose a target based on swipe direction / power
    const target = this._nearestTargetForSwipe(dx, dy) || this._nearestTargetToPoint(endPos.x, endPos.y);
    if (!target) return;
    // record which target index we moved to (if any)
    try {
      const idx = this._indexForScreenTarget(target.x, target.y);
      this._currentTargetIndex = (typeof idx === 'number') ? idx : null;
    } catch (e) { this._currentTargetIndex = null; }
    // compute target rotation (radians) based on normalized target position
    const targetRot = this._rotationForNormalizedTarget(target);

    this._isAnimating = true;
    let toDuration = Math.max(440, Math.min(700, 300 + (100 - powerPercent) * 3));
    // apply external multiplier to slow down / speed up animations
    toDuration = Math.round(toDuration * this._moveDurationMultiplier);

    // switch to catch animation texture while moving to the target
    try { this.sprite.texture = PIXI.Texture.from('./arts/gkeeper2.png'); } catch (e) {}
    // On arrival, perform a fall-down animation and remain down until reset
    this.animateTo(target.x, target.y, toDuration, () => {
      try { this.fallDown(); } catch (e) {}
    }, targetRot);
  }

  // find the index of the nearest normalized target for a screen coord
  private _indexForScreenTarget(screenX: number, screenY: number): number | null {
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

      let bestIdx: number | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < this._targets.length; i++) {
        const t = this._targets[i];
        const tx = imgLeft + t.x * imgW;
        const ty = imgTop + t.y * imgH;
        const dx = tx - screenX;
        const dy = ty - screenY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      // Increase acceptance radius slightly so side targets (esp. middle-right) are easier to hit
      if (bestDist > Math.max(120, Math.min(w, h) * 0.16)) return null;
      return bestIdx;
    } catch (e) { return null; }
  }

  // determine rotation (radians) for a normalized target {x:0..1,y:0..1}
  private _rotationForNormalizedTarget(t: { x: number; y: number }) {
    // The `t` passed in may be screen/world coords (pixels) or normalized (0..1).
    // Convert to normalized goal-relative coordinates when needed.
    let nx = t.x;
    let ny = t.y;
    try {
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const tex = PIXI.Texture.from('./arts/bg2.png');
      if (tex && tex.width && tex.height) {
        const sx = w / tex.width;
        const sy = h / tex.height;
        const s = Math.max(sx, sy);
        const imgW = tex.width * s;
        const imgH = tex.height * s;
        const imgLeft = w / 2 - imgW / 2;
        const imgTop = h / 2 - imgH / 2;
        // if coordinates look like pixels (greater than 1), convert
        if (t.x > 1 || t.y > 1) {
          nx = (t.x - imgLeft) / imgW;
          ny = (t.y - imgTop) / imgH;
        }
      } else {
        // fallback: if values >1 treat them as pixels relative to logical width/height
        if (t.x > 1 || t.y > 1) {
          nx = t.x / BASE_WIDTH;
          ny = t.y / BASE_HEIGHT;
        }
      }
    } catch (e) {
      // ignore and assume provided coords are normalized
    }

    // If the target is near center, use small/no rotation
    if (Math.abs(nx - 0.5) < 0.06 && Math.abs(ny - 0.5) < 0.06) return 0;

    // Convert normalized target to screen coords so we can compute a realistic vector
    try {
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const tex = PIXI.Texture.from('./arts/bg2.png');
      const sx = tex && tex.width ? w / tex.width : 1;
      const sy = tex && tex.height ? h / tex.height : 1;
      const s = Math.max(sx, sy);
      const imgW = (tex && tex.width) ? tex.width * s : w;
      const imgH = (tex && tex.height) ? tex.height * s : h;
      const imgLeft = w / 2 - imgW / 2;
      const imgTop = h / 2 - imgH / 2;
      const tx = imgLeft + nx * imgW;
      const ty = imgTop + ny * imgH;

      // If a per-target rotation is configured, prefer it.
      const idx = this._indexForScreenTarget(tx, ty);
      if (idx !== null) {
        const preset = (this._targetRotations && this._targetRotations[idx] != null) ? this._targetRotations[idx] : null;
        if (preset != null) return preset;
      }

      // Vector from keeper home to target
      const vx = tx - this._homeX;
      const vy = ty - this._homeY;
      const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
      // angle toward target (radians)
      const ang = Math.atan2(vy, vx);
      // scale down so rotation is not full-body over-rotation
      const scale = 0.55; // tuning: how much the keeper leans toward the target
      let rot = ang * scale;
      // clamp to reasonable human-like tilt (±75 degrees)
      const MAX_DEG = 75 * Math.PI / 180;
      if (rot > MAX_DEG) rot = MAX_DEG;
      if (rot < -MAX_DEG) rot = -MAX_DEG;
      // add a small random nuance so movements feel less mechanical
      const nuance = (Math.random() - 0.5) * (6 * Math.PI / 180); // ±6 degrees
      rot += nuance;
      return rot;
    } catch (e) {
      // fallback conservative behavior
      const sign = nx < 0.5 ? -1 : 1;
      const deg = 40;
      return sign * deg * Math.PI / 180;
    }
  }

  // compute head world position for a given container position and rotation
  private _getHeadWorldPos(containerX: number, containerY: number, rotation?: number) {
    const tex = this.sprite.texture;
    const texH = (tex && tex.height) ? tex.height : (this.sprite.height || 100);
    const anchorY = this.sprite.anchor.y || 1;
    const topLocalY = -anchorY * texH;
    const HEAD_FRACTION = 0.14;
    const headLocalY = topLocalY + texH * HEAD_FRACTION;
    const headLocalX = 0;

    const sX = this.sprite.scale ? this.sprite.scale.x : 1;
    const sY = this.sprite.scale ? this.sprite.scale.y : sX;

    const theta = (typeof rotation === 'number') ? rotation : (this.sprite.rotation || 0);
    const rx = headLocalX * sX * Math.cos(theta) - headLocalY * sY * Math.sin(theta);
    const ry = headLocalX * sX * Math.sin(theta) + headLocalY * sY * Math.cos(theta);

    return { x: containerX + rx, y: containerY + ry };
  }

  // Compute the bottom Y coordinate (ground) of the displayed `goal3` frame.
  // Mirrors the layout used by Ball2: frame center at y = 1.4 * h / 2
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

  private _nearestTargetToPoint(screenX: number, screenY: number): { x: number; y: number } | null {
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

      let best: any = null;
      let bestDist = Infinity;
      for (const t of this._targets) {
        const tx = imgLeft + t.x * imgW;
        const ty = imgTop + t.y * imgH;
        const dx = tx - screenX;
        const dy = ty - screenY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
      }
      // Make point-based nearest-target selection more forgiving (wider radius)
      if (bestDist > Math.max(120, Math.min(w, h) * 0.16)) return null;
      return best;
    } catch (e) { return null; }
  }

  private _nearestTargetForSwipe(swipeX: number, swipeY: number): { x: number; y: number } | null {
    const dist = Math.sqrt(swipeX * swipeX + swipeY * swipeY);
    if (dist < 30) return null;
    const sx = swipeX / dist;
    const sy = swipeY / dist;
    try {
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const tex = PIXI.Texture.from('./arts/bg2.png');
      if (!tex || !tex.width || !tex.height) return null;
      const scaleX = w / tex.width;
      const scaleY = h / tex.height;
      const s = Math.max(scaleX, scaleY);
      const imgW = tex.width * s;
      const imgH = tex.height * s;
      const imgLeft = w / 2 - imgW / 2;
      const imgTop = h / 2 - imgH / 2;

      let best: any = null;
      let bestDot = -Infinity;
      for (const t of this._targets) {
        const tx = imgLeft + t.x * imgW;
        const ty = imgTop + t.y * imgH;
        const vx = tx - this._homeX;
        const vy = ty - this._homeY;
        const vlen = Math.sqrt(vx * vx + vy * vy);
        if (vlen === 0) continue;
        const nx = vx / vlen;
        const ny = vy / vlen;
        const dot = nx * sx + ny * sy;
        if (dot > bestDot) { bestDot = dot; best = { x: tx, y: ty }; }
      }
      // require reasonably aligned swipe (dot ~ cos(angle)). Lower the bar slightly
      // so off-angle swipes can still select nearby side targets.
      if (bestDot < 0.25) return null;
      return best;
    } catch (e) { return null; }
  }

  private animateTo(destX: number, destY: number, durationMs: number, cb?: () => void, finalRotation?: number) {
    // We'll animate so the *head* of the sprite reaches (destX,destY).
    const startContainerX = this.x;
    const startContainerY = this.y;
    const dx = destX - startContainerX;
    const dy = destY - startContainerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arcHeight = Math.min(180, Math.max(60, dist * 0.35));

    // compute head local coordinate (relative to sprite local space)
    const tex = this.sprite.texture;
    const texH = (tex && tex.height) ? tex.height : (this.sprite.height || 100);
    const anchorY = this.sprite.anchor.y || 1;
    const topLocalY = -anchorY * texH;
    const HEAD_FRACTION = 0.14; // fraction down from top where head/face is roughly located
    const headLocalY = topLocalY + texH * HEAD_FRACTION;
    const headLocalX = 0; // assume horizontally centered

    const sX = this.sprite.scale ? this.sprite.scale.x : 1;
    const sY = this.sprite.scale ? this.sprite.scale.y : sX;

    // compute start head world position
    const theta0 = this.sprite.rotation || 0;
    const rx0 = headLocalX * sX * Math.cos(theta0) - headLocalY * sY * Math.sin(theta0);
    const ry0 = headLocalX * sX * Math.sin(theta0) + headLocalY * sY * Math.cos(theta0);
    const startHeadX = startContainerX + rx0;
    const startHeadY = startContainerY + ry0;

    // destination head world is the provided destX/destY
    const destHeadX = destX;
    const destHeadY = destY;

    const start = performance.now();
    // target tilt angle for the sprite (radians) - lean toward movement direction
    // Use the head vector (startHead -> destHead) so rotation matches the visual motion
    const headDx = destHeadX - startHeadX;
    const headDy = destHeadY - startHeadY;
    const headAngle = Math.atan2(headDy, headDx);
    const targetAngle = (typeof finalRotation === 'number') ? finalRotation : headAngle * 0.6;

    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const tt = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      // interpolate head world position along an arc
      const headX = startHeadX + (destHeadX - startHeadX) * tt;
      const headY = startHeadY + (destHeadY - startHeadY) * tt - arcHeight * 4 * tt * (1 - tt);

      // interpolate rotation for sprite
      const theta = targetAngle * tt;
      if (this.sprite) this.sprite.rotation = theta;

      // compute rotated head offset at current theta and subtract to get container pos
      const rx = headLocalX * sX * Math.cos(theta) - headLocalY * sY * Math.sin(theta);
      const ry = headLocalX * sX * Math.sin(theta) + headLocalY * sY * Math.cos(theta);

      this.x = headX - rx;
      this.y = headY - ry;

      if (t < 1) requestAnimationFrame(animate);
      else {
        // final snap: ensure head exactly on dest and final rotation
        if (this.sprite) this.sprite.rotation = targetAngle;
        const finalRx = headLocalX * sX * Math.cos(targetAngle) - headLocalY * sY * Math.sin(targetAngle);
        const finalRy = headLocalX * sX * Math.sin(targetAngle) + headLocalY * sY * Math.cos(targetAngle);
        this.x = destHeadX - finalRx;
        this.y = destHeadY - finalRy;
        if (cb) cb();
      }
    };
    requestAnimationFrame(animate);
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.sprite.destroy(); } catch (e) {}
    super.destroy(options);
  }
}
