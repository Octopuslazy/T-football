import * as PIXI from 'pixi.js';

// Simple full-screen background using ./arts/goal2.png
export default class GoalBackground extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private guides: PIXI.Graphics;
  private _onResize: () => void;

  constructor() {
    super();
    const tex = PIXI.Texture.from('./arts/goal2.png');
    this.sprite = new PIXI.Sprite(tex);
    this.sprite.anchor.set(0.5, 0.5);
    this.addChild(this.sprite);
    this.guides = new PIXI.Graphics();
    this.addChild(this.guides);

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

    // Draw responsive red rectangles (goal frame guides) relative to the
    // displayed image area so they scale correctly on all screens.
    try {
      this.guides.clear();
      const tex = this.sprite.texture;
      if (tex && tex.width && tex.height) {
        const s = this.sprite.scale.x;
        const imgW = tex.width * s;
        const imgH = tex.height * s;
        const imgLeft = this.sprite.x - imgW / 2;
        const imgTop = this.sprite.y - imgH / 2;

        // Normalized rectangles (fractions of image width/height).
        const rects = [
          // left post
          { x: 0.02 , y: 0.08, w: 0.1, h: 0.6 },
          // right post
          { x: 0.9, y: 0.08, w: 0.1, h: 0.6 },
          // top crossbar
          { x: 0, y: 0, w: 1, h: 0.1 },
        ];

        const stroke = Math.max(6, Math.round(Math.min(w, h) * 0.009));
        for (const r of rects) {
          const rx = imgLeft + r.x * imgW;
            const ry = imgTop + r.y * imgH;
            this.guides.alpha = 0;
          const rw = r.w * imgW;
          const rh = r.h * imgH;
          // Draw semi-transparent filled rectangle with red border
          this.guides.beginFill(0xff0000, 0.12);
          this.guides.drawRect(rx, ry, rw, rh);
          this.guides.endFill();
          this.guides.lineStyle(stroke, 0xff0000, 1);
          this.guides.drawRect(rx, ry, rw, rh);
        }

        // Draw scoring target circles (responsive, normalized positions)
        const circles = [
          { x: 0.18, y: 0.62 }, // bottom-left
          { x: 0.82, y: 0.62 }, // bottom-right
          { x: 0.18, y: 0.48 }, // mid-left
          { x: 0.82, y: 0.48 }, // mid-right
          { x: 0.18, y: 0.32 }, // upper-left
          { x: 0.50, y: 0.32 }, // top-center
          { x: 0.82, y: 0.32 }, // upper-right
        ];

        const circRadius = Math.max(24, Math.round(imgW * 0.09));
        for (const c of circles) {
          const cx2 = imgLeft + c.x * imgW;
          const cy2 = imgTop + c.y * imgH;
          this.guides.beginFill(0xff0000, 0.06);
          this.guides.drawCircle(cx2, cy2, circRadius);
          this.guides.endFill();
          this.guides.lineStyle(Math.max(3, Math.round(stroke * 0.7)), 0xff0000, 1);
          this.guides.drawCircle(cx2, cy2, circRadius);
        }
      }
    } catch (e) {}
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
