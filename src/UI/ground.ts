import * as PIXI from 'pixi.js';

export default class Ground extends PIXI.Container {
  private groundSprite: PIXI.Graphics;
  private skySprite: PIXI.Graphics;
  private _onResize: () => void;

  constructor() {
    super();
    
    // Create ground graphics
    this.groundSprite = new PIXI.Graphics();
    this.skySprite = new PIXI.Graphics();
    
    // Add children (sky first, then ground for proper layering)
    this.addChild(this.skySprite);
    this.addChild(this.groundSprite);

    this._onResize = this.updateScale.bind(this);
    window.addEventListener('resize', this._onResize);

    // Initial setup
    this.updateScale();
  }

  updateScale() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Sky takes 1/4 from top
    const skyHeight = screenHeight / 4;
    // Ground takes 3/4 from bottom  
    const groundHeight = (screenHeight * 3) / 4;
    
    // Clear previous drawings
    this.skySprite.clear();
    this.groundSprite.clear();
    
    // Draw sky (gradient from light blue to darker blue)
    this.drawSky(screenWidth, skyHeight);
    
    // Draw ground (gradient green field with perspective lines)
    this.drawGround(screenWidth, groundHeight, skyHeight);
    
    // Set container position - anchor mid bottom
    this.x = screenWidth / 2;
    this.y = screenHeight;
  }
  
  private drawSky(width: number, height: number) {
    // Draw sky background (simple solid fill)
    this.skySprite.clear();
    this.skySprite.beginFill(0x87CEEB);
    // Container is positioned at (screenWidth/2, screenHeight), so top-left is (-width/2, -window.innerHeight)
    this.skySprite.drawRect(-width / 2, -window.innerHeight, width, height);
    this.skySprite.endFill();
  }
  
  private drawGround(width: number, height: number, skyOffset: number) {
    // Create soccer field perspective
    const fieldColor = 0x228B22; // Forest green
    
    // Draw ground base
    this.groundSprite.clear();
    this.groundSprite.beginFill(fieldColor);
    // Ground should occupy the bottom portion; container is at y=screenHeight so draw from -height to 0
    this.groundSprite.drawRect(-width / 2, -height, width, height);
    this.groundSprite.endFill();
  }
 
  // Get ground level for ball physics
  public getGroundLevel() {
    return 0; // Ground is at y = 0 in this coordinate system
  }
  
  // Check if a point is on the field
  public isOnField(x: number, y: number) {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const groundHeight = (screenHeight * 3) / 4;
    
    return x >= -screenWidth/2 && 
           x <= screenWidth/2 && 
           y >= -groundHeight && 
           y <= 0;
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}