import * as PIXI from 'pixi.js';

// Use bg2 as the background image and goal3 as an overlay/frame.
// Both sprites are centered and scaled responsively so they keep
// consistent layout across different screen sizes.
export default class GoalBackground extends PIXI.Container {
  private bgSprite: PIXI.Sprite;
  private frameSprite: PIXI.Sprite;
  private guides: PIXI.Graphics;
  private frameScale: number = 0.75;
  private _onResize: () => void;

  constructor() {
    super();
    const bgTex = PIXI.Texture.from('./arts/bg2.png');
    this.bgSprite = new PIXI.Sprite(bgTex);
    this.bgSprite.anchor.set(0.5, 0.5);
    this.addChild(this.bgSprite);

    const frameTex = PIXI.Texture.from('./arts/goal3.png');
    this.frameSprite = new PIXI.Sprite(frameTex);
    this.frameSprite.anchor.set(0.5, 0.5);
    // keep frameSprite as a child initially, but it can be detached by caller
    this.addChild(this.frameSprite);

    this.guides = new PIXI.Graphics();
    this.addChild(this.guides);

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);

    this.resize();
  }

  // Adjust how large the frame overlay is relative to the background display area.
  // Example: 1 = natural fit, 0.9 = slightly smaller, 1.2 = slightly larger.
  public setFrameScale(s: number) {
    this.frameScale = Math.max(0.01, s || 1);
    this.resize();
  }

  // Remove the internal frame sprite from this container and return it
  // so callers can re-parent it (for separate layering). If already detached,
  // returns null.
  public detachFrameSprite(): PIXI.Sprite | null {
    if (!this.frameSprite || !this.frameSprite.parent) return null;
    try {
      this.removeChild(this.frameSprite);
      return this.frameSprite;
    } catch (e) { return null; }
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.bgSprite.x = w / 2;
    this.bgSprite.y = h / 2;
    this.frameSprite.x = w / 2;
    this.frameSprite.y = 1.4*h / 2;

    // Scale background to cover the screen (cover behavior)
    const bgTex = this.bgSprite.texture;
    if (bgTex && bgTex.width && bgTex.height) {
      const sx = w / bgTex.width;
      const sy = h / bgTex.height;
      const s = Math.max(sx, sy);
      this.bgSprite.scale.set(s, s);

      // Scale frame relative to the displayed background area
      const frameTex = this.frameSprite.texture;
      if (frameTex && frameTex.width && frameTex.height) {
        // Fit the frame inside the background display area while preserving aspect ratio
        const frameSx = (bgTex.width * s) / frameTex.width;
        const frameSy = (bgTex.height * s) / frameTex.height;
        const fs = Math.min(frameSx, frameSy) * this.frameScale;
        this.frameSprite.scale.set(fs, fs);
      } else {
        this.frameSprite.scale.set(s, s);
      }

      // Draw responsive red target circles relative to the displayed background
      try {
        this.guides.clear();
        const sDisplay = this.bgSprite.scale.x;
        const imgW = bgTex.width * sDisplay;
        const imgH = bgTex.height * sDisplay;
        const imgLeft = this.bgSprite.x - imgW / 2;
        const imgTop = this.bgSprite.y - imgH / 2;

        const circles = [
          { x: 0.228, y: 0.75 },
          { x: 0.78, y: 0.75 },
          { x: 0.33, y: 0.69 },
          { x: 0.66, y: 0.69 },
          { x: 0.228, y: 0.63 },
          { x: 0.50, y: 0.63 },
          { x: 0.78, y: 0.63 },
        ];

        const circRadius = Math.max(24, Math.round(imgW * 0.03));
        const stroke = Math.max(3, Math.round(Math.min(w, h) * 0.009));
        for (const c of circles) {
          const cx2 = imgLeft + c.x * imgW;
          const cy2 = imgTop + c.y * imgH;
          this.guides.beginFill(0xff0000, 0.06);
          this.guides.drawCircle(cx2, cy2, circRadius);
          this.guides.endFill();
          this.guides.lineStyle(Math.max(2, Math.round(stroke * 0.7)), 0xff0000, 1);
          this.guides.drawCircle(cx2, cy2, circRadius);
        }
      } catch (e) {
        // ignore drawing errors
      }
    } else {
      this.bgSprite.scale.set(1, 1);
      this.frameSprite.scale.set(1, 1);
    }
  }

  public refresh() {
    
    this.resize();
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    try { this.bgSprite.destroy(); } catch (e) {}
    try { this.frameSprite.destroy(); } catch (e) {}
    try { this.guides.destroy(); } catch (e) {}
    super.destroy(options);
  }}
 
