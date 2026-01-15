import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../constant/global';

// Simple static goalkeeper sprite for Other mode.
export default class Goalkeeper2 extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private _onResize: () => void;
  private _pointerDownPos: { x: number; y: number } | null = null;
  private _isAnimating: boolean = false;
  private _homeX: number = 0;
  private _homeY: number = 0;
  private _isDragging: boolean = false;
  private _dragTime: number = 0;
  private _startPos: { x: number; y: number } = { x: 0, y: 0 };

  private _targets = [
    { x: 0.18, y: 0.62 }, // bottom-left (1)
    { x: 0.82, y: 0.62 }, // bottom-right (7)
    { x: 0.18, y: 0.48 }, // mid-left (2)
    { x: 0.82, y: 0.48 }, // mid-right (6)
    { x: 0.18, y: 0.32 }, // upper-left (3)
    { x: 0.5, y: 0.32 },  // upper-center (4) - jump only, no rotation
    { x: 0.82, y: 0.32 }, // upper-right (5)
  ];

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
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // place horizontally centered, vertically around 66% down the screen
    this.x = w / 2;
    this.y = h * 0.72;

    // store home position
    this._homeX = this.x;
    this._homeY = this.y;

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

  private onDragStart(event: PIXI.FederatedPointerEvent) {
    if (this._isAnimating) return;
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
  }

  private onDragMove(event: PIXI.FederatedPointerEvent) {
    // optional: could show preview or adjust sprite while dragging
    if (!this._isDragging || this._isAnimating) return;
  }

  private onDragEnd(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._isAnimating) return;
    this._isDragging = false;
    const endPos = { x: event.global.x, y: event.global.y };

    const dx = endPos.x - this._startPos.x;
    const dy = endPos.y - this._startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const dragDuration = Math.max(1, Date.now() - this._dragTime);

    // swipe speed (pixels per second)
    const swipePps = distance * 1000 / dragDuration;
    const maxSwipeSpeed = 2000;
    const minSwipeSpeed = 100;
    const powerPercent = Math.max(0, Math.min(100, ((swipePps - minSwipeSpeed) / (maxSwipeSpeed - minSwipeSpeed)) * 100));

    if (distance < 10 || powerPercent < 5) return; // ignore tiny/weak gestures

    // choose a target based on swipe direction / power
    const target = this._nearestTargetForSwipe(dx, dy) || this._nearestTargetToPoint(endPos.x, endPos.y);
    if (!target) return;
    // compute target rotation (radians) based on normalized target position
    const targetRot = this._rotationForNormalizedTarget(target);

    this._isAnimating = true;
    const toDuration = Math.max(240, Math.min(700, 300 + (100 - powerPercent) * 3));
    const returnDuration = Math.max(300, 400 - Math.round(powerPercent * 1.2));

    // switch to catch animation texture while moving to the target
    try { this.sprite.texture = PIXI.Texture.from('./arts/gkeeper2.png'); } catch (e) {}
    this.animateTo(target.x, target.y, toDuration, () => {
      // wait 1s so catch pose is visible, then reset keeper to home
      setTimeout(() => {
        try { this.sprite.texture = PIXI.Texture.from('./arts/gkeeper.png'); } catch (e) {}
        if (this.sprite) this.sprite.rotation = 0;
        this.x = this._homeX;
        this.y = this._homeY;
        this._isAnimating = false;
      }, 1000);
    }, targetRot);
  }

  // determine rotation (radians) for a normalized target {x:0..1,y:0..1}
  private _rotationForNormalizedTarget(t: { x: number; y: number }) {
    // The `t` passed in may be screen/world coords (pixels) or normalized (0..1).
    // Convert to normalized goal-relative coordinates when needed.
    let nx = t.x;
    let ny = t.y;
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tex = PIXI.Texture.from('./arts/goal2.png');
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
        // fallback: if values >1 treat them as pixels relative to window
        if (t.x > 1 || t.y > 1) {
          nx = t.x / window.innerWidth;
          ny = t.y / window.innerHeight;
        }
      }
    } catch (e) {
      // ignore and assume provided coords are normalized
    }

    // center-ish target -> no rotation (jump only)
    if (Math.abs(nx - 0.5) < 0.06) return 0;
    // sign: left negative, right positive (mirror) — inverted per request
    const sign = nx < 0.5 ? -1 : 1;
    // decide magnitude by vertical zone (bottom, mid, top)
    let deg = 35;
    if (ny >= 0.57) deg = 90; // bottom
    else if (ny >= 0.44) deg = 35; // mid
    else deg = 50; // top
    return sign * deg * Math.PI / 180;
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

  private _nearestTargetToPoint(screenX: number, screenY: number): { x: number; y: number } | null {
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
      if (bestDist > Math.max(80, Math.min(w, h) * 0.12)) return null;
      return best;
    } catch (e) { return null; }
  }

  private _nearestTargetForSwipe(swipeX: number, swipeY: number): { x: number; y: number } | null {
    const dist = Math.sqrt(swipeX * swipeX + swipeY * swipeY);
    if (dist < 30) return null;
    const sx = swipeX / dist;
    const sy = swipeY / dist;
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tex = PIXI.Texture.from('./arts/goal2.png');
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
      // require reasonably aligned swipe (dot ~ cos(angle)); 0.4 ~= ~66deg
      if (bestDot < 0.35) return null;
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
