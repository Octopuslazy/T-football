import * as PIXI from 'pixi.js';

export default class StartScreen extends PIXI.Container {
  public onSelect?: (mode: 'play' | 'other') => void;

  private bg: PIXI.Graphics;
  private bgSprite?: PIXI.Sprite;
  private title: PIXI.Text;
  private playBtn: PIXI.Container;
  private otherBtn: PIXI.Container;

  constructor() {
    super();

    this.bg = new PIXI.Graphics();
    this.drawBackground();
    this.addChild(this.bg);

    // background image (optional). Use project-relative path; texture may be loaded by the app preloader.
    try {
      // Create sprite with a texture; prefer the texture stored in PIXI.Assets if available
      const key = './arts/startscreen.png';
      let tex: PIXI.Texture | null = null;
      try {
        const assetsGet = (PIXI as any).Assets && (PIXI as any).Assets.get;
        if (assetsGet) tex = (PIXI as any).Assets.get(key) as PIXI.Texture || null;
      } catch (e) {}
      if (!tex) {
        try { tex = PIXI.Texture.from(key); } catch (e) { tex = null; }
      }
      if (tex) {
        this.bgSprite = new PIXI.Sprite(tex);
        this.addChildAt(this.bgSprite, 0);
      }
    } catch (e) {}

    this.title = new PIXI.Text('Play Mode', {
      fontFamily: 'Arial', fontSize: 36, fill: 0xffffff, fontWeight: 'bold'
    } as any);
    this.title.anchor.set(0.5, 0);
    this.addChild(this.title);

    this.playBtn = this.createButton('Penalty Kick Mode', 0x2ecc71);
    this.otherBtn = this.createButton('Goalkeeper Mode', 0x3498db);

    this.addChild(this.playBtn);
    this.addChild(this.otherBtn);

    // Make the start screen capture all pointer events so clicks don't
    // reach underlying gameplay UI while the start screen is visible.
    this.interactive = true;
    // full-window hit area
    (this as any).hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
    this.on('pointerdown', (e: any) => { try { e.stopPropagation?.(); } catch (e) {} });

    this.resize();

    window.addEventListener('resize', () => this.resize());
  }

  private drawBackground() {
    // If a sprite background is available, size it to cover (best-effort). Otherwise draw solid background.
    if (this.bgSprite && this.bgSprite.texture) {
      try {
        const tex = this.bgSprite.texture;
        const tw = (tex.width && tex.width > 0) ? tex.width : ((tex.orig && (tex.orig as any).width) || ((tex.baseTexture && (tex.baseTexture as any).width) || 1));
        const th = (tex.height && tex.height > 0) ? tex.height : ((tex.orig && (tex.orig as any).height) || ((tex.baseTexture && (tex.baseTexture as any).height) || 1));
        const sx = window.innerWidth / tw;
        const sy = window.innerHeight / th;
        const s = Math.max(sx, sy);
        this.bgSprite.scale.set(s, s);
        this.bgSprite.x = (window.innerWidth - tw * s) / 2;
        this.bgSprite.y = (window.innerHeight - th * s) / 2;
        this.bg.visible = false;
        this.bgSprite.visible = true;
        return;
      } catch (e) {
        // fall back to solid background
      }
    }

    this.bg.clear();
    this.bg.beginFill(0x000000, 1);
    this.bg.drawRect(0, 0, window.innerWidth, window.innerHeight);
    this.bg.endFill();
    if (this.bgSprite) this.bgSprite.visible = false;
  }

  private createButton(label: string, color: number) {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(color);
    g.drawRoundedRect(-120, -28, 240, 56, 8);
    g.endFill();
    const t = new PIXI.Text(label, { fontFamily: 'Arial', fontSize: 20, fill: 0xffffff } as any);
    t.anchor.set(0.5);
    c.addChild(g);
    c.addChild(t);
    c.interactive = true;
    c.cursor = 'pointer';
    c.on('pointerdown', () => {
      if (label === 'Penalty Kick Mode') this.onSelect?.('play'); else this.onSelect?.('other');
    });
    return c;
  }

  private resize() {
    this.drawBackground();
    this.x = 0; this.y = 0;
    this.title.x = window.innerWidth / 2;
    this.title.y = 120;

    this.playBtn.x = window.innerWidth / 2;
    this.playBtn.y = window.innerHeight / 2 - 24;

    this.otherBtn.x = window.innerWidth / 2;
    this.otherBtn.y = window.innerHeight / 2 + 48;

    // update hitArea size
    try { (this as any).hitArea.width = window.innerWidth; (this as any).hitArea.height = window.innerHeight; } catch (e) {}
  }
}
