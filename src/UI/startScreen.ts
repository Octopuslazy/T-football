import * as PIXI from 'pixi.js';
import { BASE_WIDTH } from '../constant/global';

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

    this.title = new PIXI.Text(' ', {
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
    // initial placeholder size; real sizing happens in resize()
    g.beginFill(color);
    g.drawRoundedRect(-100, -24, 200, 48, 8);
    g.endFill();
    const t = new PIXI.Text(label, { fontFamily: 'Roboto', fontSize: 24, fill: 0x000000 } as any);
    t.anchor.set(0.5);
    c.addChild(g);
    c.addChild(t);
    // store references for dynamic resizing
    (c as any).__bg = g;
    (c as any).__label = t;
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

    // Responsive button sizing: scale relative to design width so layout
    // remains consistent across mobile portrait devices.
    const maxBtnWidth = Math.min(window.innerWidth * 0.85, BASE_WIDTH * 0.85);
    const btnWidth = Math.max(180, Math.round(maxBtnWidth));
    const btnHeight = Math.max(44, Math.round(btnWidth * 0.12));
    const fontSize = Math.max(14, Math.round(btnHeight * 0.5));

    const layoutCenterX = window.innerWidth / 2;
    const firstY = Math.round(window.innerHeight * 0.66);

    // Update play button visuals
    try {
      const g = (this.playBtn as any).__bg as PIXI.Graphics;
      const t = (this.playBtn as any).__label as PIXI.Text;
      g.clear();
      g.beginFill(0x2ecc71);
      g.drawRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, Math.max(6, Math.round(btnHeight*0.15)));
      g.endFill();
      t.style = { ...(t.style as any), fontSize } as any;
      t.anchor.set(0.5);
      t.x = 0; t.y = 0;
      this.playBtn.x = layoutCenterX; this.playBtn.y = firstY;
    } catch (e) {}

    // Update other button visuals
    try {
      const g2 = (this.otherBtn as any).__bg as PIXI.Graphics;
      const t2 = (this.otherBtn as any).__label as PIXI.Text;
      g2.clear();
      g2.beginFill(0x3498db);
      g2.drawRoundedRect(-btnWidth/2, -btnHeight/2, btnWidth, btnHeight, Math.max(6, Math.round(btnHeight*0.15)));
      g2.endFill();
      t2.style = { ...(t2.style as any), fontSize } as any;
      t2.anchor.set(0.5);
      t2.x = 0; t2.y = 0;
      this.otherBtn.x = layoutCenterX; this.otherBtn.y = firstY + btnHeight + 18;
    } catch (e) {}

    // update hitArea size
    try { (this as any).hitArea.width = window.innerWidth; (this as any).hitArea.height = window.innerHeight; } catch (e) {}
  }
}
