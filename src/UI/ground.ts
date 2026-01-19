import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

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
    // Use base design resolution so the ground aligns with world coordinates
    const screenWidth = BASE_WIDTH;
    const screenHeight = BASE_HEIGHT;

    // Sky takes 1/4 from top (in base coords)
    const skyHeight = Math.round(screenHeight / 4);
    // Ground takes 3/4 from bottom  
    const groundHeight = screenHeight - skyHeight;

    // Clear previous drawings
    this.skySprite.clear();
    this.groundSprite.clear();

    // Draw sky and ground using base resolution units
    this.drawSky(screenWidth, skyHeight);
    this.drawGround(screenWidth, groundHeight, skyHeight);

    // Set container position in world coords (anchor mid bottom)
    this.x = Math.round(screenWidth / 2);
    this.y = Math.round(screenHeight);
  }
  
  private drawSky(width: number, height: number) {
    // Draw sky background (simple solid fill)
    this.skySprite.clear();
    this.skySprite.beginFill(0x87CEEB);
    // Container is positioned at (BASE_WIDTH/2, BASE_HEIGHT), so draw sky above the field
    this.skySprite.drawRect(-width / 2, - (height + (BASE_HEIGHT - height)), width, height);
    this.skySprite.endFill();
  }
  
  private drawGround(width: number, height: number, skyOffset: number) {
    // Create soccer field perspective
    const fieldColor = 0x228B22; // Forest green
    
    // Draw ground base
    this.groundSprite.clear();
    this.groundSprite.beginFill(fieldColor);
    // Ground should occupy the bottom portion; container is at y=BASE_HEIGHT so draw from -height to 0
    this.groundSprite.drawRect(-width / 2, -height, width, height);
    this.groundSprite.endFill();
  }
 
  // Get ground level for ball physics
  public getGroundLevel() {
    return 0; // Ground is at y = 0 in this coordinate system
  }
  
  // Check if a point is on the field
  public isOnField(x: number, y: number) {
      const screenWidth = BASE_WIDTH;
      const screenHeight = BASE_HEIGHT;
      const skyHeight = Math.round(screenHeight / 4);
      const groundHeight = screenHeight - skyHeight;

      return x >= -screenWidth/2 && 
        x <= screenWidth/2 && 
        y >= -groundHeight && 
        y <= 0;
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }

  // Public refresh so callers can request a layout update
  public refresh() {
    try { this.updateScale(); } catch (e) {}
  }
}