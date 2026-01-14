import * as PIXI from 'pixi.js';

export default class StartScreen extends PIXI.Container {
  public onSelect?: (mode: 'play' | 'other') => void;

  private bg: PIXI.Graphics;
  private title: PIXI.Text;
  private playBtn: PIXI.Container;
  private otherBtn: PIXI.Container;

  constructor() {
    super();

    this.bg = new PIXI.Graphics();
    this.drawBackground();
    this.addChild(this.bg);

    this.title = new PIXI.Text('Chọn chế độ chơi', {
      fontFamily: 'Arial', fontSize: 36, fill: 0xffffff, fontWeight: 'bold'
    } as any);
    this.title.anchor.set(0.5, 0);
    this.addChild(this.title);

    this.playBtn = this.createButton('Chơi', 0x2ecc71);
    this.otherBtn = this.createButton('Chế độ khác', 0x3498db);

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
    this.bg.clear();
    this.bg.beginFill(0x000000, 0.6);
    this.bg.drawRect(0, 0, window.innerWidth, window.innerHeight);
    this.bg.endFill();
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
      if (label === 'Chơi') this.onSelect?.('play'); else this.onSelect?.('other');
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
