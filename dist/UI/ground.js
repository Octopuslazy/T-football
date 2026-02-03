import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';
export default class Ground extends PIXI.Container {
    constructor() {
        super();
        // bgimagine
        this.bgimagine = PIXI.Sprite.from('/Assets/arts/BG_1.png');
        this.bgimagine.anchor.set(0.5, 1);
        // Create ground graphics
        this.groundSprite = new PIXI.Graphics();
        this.groundSprite.alpha = 0;
        this.skySprite = new PIXI.Graphics();
        this.skySprite.alpha = 0;
        // Add children (sky first, then ground for proper layering)
        this.addChild(this.skySprite);
        this.addChild(this.groundSprite);
        this.addChild(this.bgimagine);
        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);
        // Initial setup
        this.updateScale();
    }
    updateScale() {
        const screenWidth = BASE_WIDTH;
        const screenHeight = BASE_HEIGHT;
        //bgimagine
        const scale = Math.max(BASE_WIDTH / this.bgimagine.width, BASE_HEIGHT / this.bgimagine.height);
        this.bgimagine.scale.set(scale);
        this.bgimagine.x = 0;
        this.bgimagine.y = 0;
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
        // Set container position - anchor mid bottom (in design coords)
        this.x = screenWidth / 2;
        this.y = screenHeight;
    }
    drawSky(width, height) {
        // Draw sky background (simple solid fill)
        this.skySprite.clear();
        this.skySprite.beginFill(0x87CEEB);
        // Container is positioned at (screenWidth/2, screenHeight), so top-left is (-width/2, -BASE_HEIGHT)
        this.skySprite.drawRect(-width / 2, -BASE_HEIGHT, width, height);
        this.skySprite.endFill();
    }
    drawGround(width, height, skyOffset) {
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
    getGroundLevel() {
        return 0; // Ground is at y = 0 in this coordinate system
    }
    // Check if a point is on the field
    isOnField(x, y) {
        const screenWidth = BASE_WIDTH;
        const screenHeight = BASE_HEIGHT;
        const groundHeight = (screenHeight * 3) / 4;
        return x >= -screenWidth / 2 &&
            x <= screenWidth / 2 &&
            y >= -groundHeight &&
            y <= 0;
    }
    destroy(options) {
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
}
