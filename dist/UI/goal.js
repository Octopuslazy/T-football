import * as PIXI from 'pixi.js';
export default class Goal extends PIXI.Container {
    constructor() {
        super();
        this.showZones = true; // Toggle zone visualization
        // Create goal sprite
        const tex = PIXI.Texture.from('/Assets/arts/goal.png');
        this.goalSprite = new PIXI.Sprite(tex);
        this.goalSprite.anchor.set(0.5, 0); // mid-top
        // Create goal posts
        this.leftPost = new PIXI.Graphics();
        this.rightPost = new PIXI.Graphics();
        this.crossbar = new PIXI.Graphics();
        // Create zone visualization
        this.zoneVisualization = new PIXI.Graphics();
        // Add children
        this.addChild(this.goalSprite);
        this.addChild(this.leftPost);
        this.addChild(this.rightPost);
        this.addChild(this.crossbar);
        this.addChild(this.zoneVisualization);
        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);
        // Initial placement/scale
        if (this.goalSprite.texture && this.goalSprite.texture.width) {
            this.updateScale();
        }
        else {
            // If texture isn't loaded yet, wait for it
            this.goalSprite.texture.on('update', () => this.updateScale());
        }
    }
    updateScale() {
        if (!this.goalSprite.texture || !this.goalSprite.texture.width)
            return;
        const targetWidth = (window.innerWidth / 2) * 1.4; // Full half-screen width
        const s = targetWidth / this.goalSprite.texture.width;
        this.goalSprite.scale.set(s, s);
        // Center horizontally, place near top of screen but visible
        this.goalSprite.x = window.innerWidth / 2;
        this.goalSprite.y = 200;
        // Update goal posts to match scaled goal
        this.updateGoalPosts(s);
        // Draw zone visualization
        this.drawZoneVisualization();
    }
    updateGoalPosts(scale) {
        const postColor = 0xFF0000; // red color
        const postWidth = 10 * scale;
        const postHeight = 520 * scale;
        const crossbarHeight = 10 * scale;
        // Get goal sprite bounds after scaling
        const goalBounds = this.goalSprite.getBounds();
        // Clear and redraw left post (anchor: top-left)
        this.leftPost.clear();
        this.leftPost.fill(postColor);
        this.leftPost.rect(0, 0, postWidth, postHeight);
        this.leftPost.fill();
        this.leftPost.pivot.set(0, 0); // anchor top-left
        this.leftPost.x = goalBounds.left;
        this.leftPost.y = goalBounds.top;
        // Clear and redraw right post (anchor: top-right)
        this.rightPost.clear();
        this.rightPost.fill(postColor);
        this.rightPost.rect(0, 0, postWidth, postHeight);
        this.rightPost.fill();
        this.rightPost.pivot.set(postWidth, 0); // anchor top-right
        this.rightPost.x = goalBounds.right;
        this.rightPost.y = goalBounds.top;
        // Clear and redraw crossbar (anchor: mid-top)
        this.crossbar.clear();
        this.crossbar.fill(postColor);
        this.crossbar.rect(0, 0, goalBounds.width, crossbarHeight);
        this.crossbar.fill();
        this.crossbar.pivot.set(goalBounds.width / 2, 0); // anchor mid-top
        this.crossbar.x = goalBounds.left + goalBounds.width / 2;
        this.crossbar.y = goalBounds.top;
    }
    // Get collision rectangles for physics
    getCollisionRects() {
        return [
            // Left post
            {
                x: this.leftPost.x,
                y: this.leftPost.y,
                width: this.leftPost.width,
                height: this.leftPost.height
            },
            // Right post
            {
                x: this.rightPost.x,
                y: this.rightPost.y,
                width: this.rightPost.width,
                height: this.rightPost.height
            },
            // Crossbar
            {
                x: this.crossbar.x,
                y: this.crossbar.y,
                width: this.crossbar.width,
                height: this.crossbar.height
            }
        ];
    }
    // Get goal area for scoring (inside the goal)
    getGoalArea() {
        return {
            x: this.leftPost.x + this.leftPost.width,
            y: this.leftPost.y + this.crossbar.height,
            width: this.rightPost.x - (this.leftPost.x + this.leftPost.width),
            height: this.leftPost.height - this.crossbar.height
        };
    }
    // Get 12 goal zones (3 rows x 4 columns)
    getGoalZones() {
        const goalArea = this.getGoalArea();
        const zoneWidth = goalArea.width / 4;
        const zoneHeight = goalArea.height / 3;
        const zones = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                zones.push({
                    id: row * 4 + col + 1, // Zone ID 1-12
                    row: row,
                    col: col,
                    x: goalArea.x + col * zoneWidth,
                    y: goalArea.y + row * zoneHeight,
                    width: zoneWidth,
                    height: zoneHeight
                });
            }
        }
        return zones;
    }
    // Check which zone the ball hit (returns zone info or null)
    getZoneFromPosition(ballX, ballY) {
        const zones = this.getGoalZones();
        for (const zone of zones) {
            if (ballX >= zone.x &&
                ballX <= zone.x + zone.width &&
                ballY >= zone.y &&
                ballY <= zone.y + zone.height) {
                return zone;
            }
        }
        return null; // Not in any zone
    }
    // Check if ball is in goal area at all
    isInGoalArea(ballX, ballY) {
        const goalArea = this.getGoalArea();
        return ballX >= goalArea.x &&
            ballX <= goalArea.x + goalArea.width &&
            ballY >= goalArea.y &&
            ballY <= goalArea.y + goalArea.height;
    }
    // Draw visual representation of the 12 zones
    drawZoneVisualization() {
        if (!this.showZones)
            return;
        this.zoneVisualization.clear();
        const zones = this.getGoalZones();
        const goalArea = this.getGoalArea();
        // Calculate circle diameter as 1/4 of goal area height
        const circleRadius = (goalArea.height / 4) / 2;
        for (let i = 0; i < zones.length; i++) {
            const zone = zones[i];
            // Draw zone border (rectangle)
            this.zoneVisualization.stroke({ color: 0xFF0000, alpha: 0.7, width: 2 });
            this.zoneVisualization.rect(zone.x, zone.y, zone.width, zone.height);
            this.zoneVisualization.stroke();
            // Draw zone center
            const centerX = zone.x + zone.width / 2;
            const centerY = zone.y + zone.height / 2;
            // Draw a circle with diameter = 1/4 of goalArea height
            this.zoneVisualization.fill({ color: 0xFF0000, alpha: 0.5 });
            this.zoneVisualization.circle(centerX, centerY, circleRadius);
            this.zoneVisualization.fill();
        }
    }
    // Toggle zone visualization on/off
    toggleZoneVisualization() {
        this.showZones = !this.showZones;
        if (this.showZones) {
            this.drawZoneVisualization();
        }
        else {
            this.zoneVisualization.clear();
        }
    }
    destroy(options) {
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
}
