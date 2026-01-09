import * as PIXI from 'pixi.js';
export default class Ground extends PIXI.Container {
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
    drawSky(width, height) {
        // Create sky gradient (light blue to darker blue)
        const skyGradient = [
            { color: 0x87CEEB, alpha: 1 }, // Sky blue at top
            { color: 0x4682B4, alpha: 1 } // Steel blue at bottom
        ];
        // Draw sky background
        this.skySprite.beginFill(0x87CEEB);
        this.skySprite.drawRect(-width / 2, -height, width, height);
        this.skySprite.endFill();
    }
    drawGround(width, height, skyOffset) {
        // Create soccer field perspective
        const fieldColor = 0x228B22; // Forest green
        // Draw ground base
        this.groundSprite.beginFill(fieldColor);
        this.groundSprite.drawRect(-width / 2, -height, width, height);
        this.groundSprite.endFill();
        // Add field gradient for depth
        this.addDepthGradient(width, height);
    }
    drawFieldLines(width, height, lineColor) {
        this.groundSprite.lineStyle(3, lineColor, 0.8);
        // Center line (horizontal)
        const centerY = -height / 2;
        this.groundSprite.moveTo(-width / 2, centerY);
        this.groundSprite.lineTo(width / 2, centerY);
        // Penalty area lines (perspective)
        const penaltyWidth = width * 0.3;
        const penaltyDepth = height * 0.2;
        // Top penalty area (near goal)
        this.groundSprite.drawRect(-penaltyWidth / 2, -height, penaltyWidth, penaltyDepth);
        // Goal area (smaller box)
        const goalWidth = width * 0.15;
        const goalDepth = height * 0.1;
        this.groundSprite.drawRect(-goalWidth / 2, -height, goalWidth, goalDepth);
        // Side lines with perspective
        this.groundSprite.moveTo(-width / 2, -height);
        this.groundSprite.lineTo(-width / 2, 0);
        this.groundSprite.moveTo(width / 2, -height);
        this.groundSprite.lineTo(width / 2, 0);
        // Center circle
        const circleRadius = Math.min(width, height) * 0.08;
        this.groundSprite.drawCircle(0, centerY, circleRadius);
        // Add yard lines for perspective depth
        for (let i = 1; i < 6; i++) {
            const lineY = -height + (height * i / 6);
            const lineAlpha = 0.3 + (i * 0.1); // Lines get more visible towards player
            this.groundSprite.lineStyle(2, lineColor, lineAlpha);
            this.groundSprite.moveTo(-width / 2, lineY);
            this.groundSprite.lineTo(width / 2, lineY);
        }
    }
    addDepthGradient(width, height) {
        // Add subtle gradient overlay for depth perception
        const gradientSteps = 10;
        const stepHeight = height / gradientSteps;
        for (let i = 0; i < gradientSteps; i++) {
            const alpha = i * 0.02; // Subtle gradient
            const darkColor = 0x006400; // Dark green
            this.groundSprite.beginFill(darkColor, alpha);
            this.groundSprite.drawRect(-width / 2, -height + (i * stepHeight), width, stepHeight);
            this.groundSprite.endFill();
        }
    }
    // Get ground level for ball physics
    getGroundLevel() {
        return 0; // Ground is at y = 0 in this coordinate system
    }
    // Check if a point is on the field
    isOnField(x, y) {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
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
