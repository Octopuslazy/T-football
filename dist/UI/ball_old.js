import * as PIXI from 'pixi.js';
export default class Ball extends PIXI.Container {
    constructor(gameState, goal) {
        super();
        this._velocity = { x: 0, y: 0 }; // Simple 2D velocity
        this._isMoving = false;
        this._isDragging = false;
        this._dragTime = 0; // Track drag duration for power
        this._inGoal = false; // Track if ball is inside goal
        this._startPos = { x: 0, y: 0 };
        this._minSpeed = 15;
        this._maxSpeed = 35;
        this._goalScored = false;
        // Create ball sprite
        const tex = PIXI.Texture.from('/Assets/arts/ball.png');
        this.ballSprite = new PIXI.Sprite(tex);
        this.ballSprite.anchor.set(0.5, 0.5); // Center anchor
        // Create shadow
        this.shadowSprite = new PIXI.Graphics();
        // Create power indicator
        this.powerIndicator = new PIXI.Graphics();
        this.powerText = new PIXI.Text({
            text: 'Lực: 0%',
            style: {
                fontFamily: 'Arial',
                fontSize: 20,
                fill: 0xFFFFFF,
                fontWeight: 'bold'
            }
        });
        this.powerText.anchor.set(0.5);
        // Add children (shadow first, then ball)
        this.addChild(this.shadowSprite);
        this.addChild(this.ballSprite);
        this.addChild(this.powerIndicator);
        this.addChild(this.powerText);
        this.interactive = true;
        this.cursor = 'pointer';
        this.gameState = gameState;
        this.goal = goal;
        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);
        // Initial scale and position
        if (this.ballSprite.texture && this.ballSprite.texture.width) {
            this.updateScale();
        }
        else {
            // If texture isn't loaded yet, wait for it
            this.ballSprite.texture.on('update', () => this.updateScale());
        }
        this.setupInteraction();
        // Update loop
        this.onEnterFrame = this.update.bind(this);
        PIXI.Ticker.shared.add(this.onEnterFrame);
    }
    updateScale() {
        if (!this.ballSprite.texture || !this.ballSprite.texture.width)
            return;
        // Scale ball to be 1/20 of screen width
        const targetWidth = window.innerWidth / 20;
        const s = targetWidth / this.ballSprite.texture.width;
        this.ballSprite.scale.set(s, s);
        // Position ball on ground level (3/4 down from top)
        const groundLevel = (window.innerHeight * 3) / 4;
        this.x = window.innerWidth / 2;
        this.y = groundLevel; // Position at ground level
        this._height = 0; // Reset height
        // Update ball position based on height
        this.updateBallPosition();
        this.updateShadow();
    }
    updateBallPosition() {
        // Move ball sprite up based on height for 2.5D effect
        // The higher the ball, the more it moves up visually
        this.ballSprite.y = -this._height * 0.8; // Scale height effect
        // Calculate perspective scale based on Y position (closer to goal = smaller)
        const screenHeight = window.innerHeight;
        const groundLevel = (screenHeight * 3) / 4;
        const skyLevel = screenHeight / 4;
        // Distance from bottom (closer to bottom = bigger, closer to top = smaller)
        const distanceFromBottom = Math.max(0, this.y - skyLevel);
        const maxDistance = groundLevel - skyLevel;
        const perspectiveScale = 0.5 + (distanceFromBottom / maxDistance) * 0.5; // Scale from 0.5 to 1.0
        // Combine perspective with height scaling
        const heightScale = 1 + (this._height * 0.001); // Slight height effect
        const finalScale = this._baseScale * perspectiveScale * heightScale;
        this.ballSprite.scale.set(finalScale, finalScale);
    }
    updatePowerIndicator(power) {
        this.powerIndicator.clear();
        this.powerText.text = `Lực: ${Math.round(power)}%`;
        this.powerText.x = 0;
        this.powerText.y = -this.ballSprite.height - 40;
        if (power > 0) {
            // Draw power bar
            const barWidth = 100;
            const barHeight = 10;
            const fillWidth = (barWidth * power) / 100;
            // Background bar
            this.powerIndicator.fill(0x333333, 0.8);
            this.powerIndicator.rect(-barWidth / 2, -this.ballSprite.height - 60, barWidth, barHeight);
            this.powerIndicator.fill();
            // Power fill (color changes based on power level)
            const color = power < 33 ? 0x00FF00 : power < 66 ? 0xFFFF00 : 0xFF0000;
            this.powerIndicator.fill(color, 0.9);
            this.powerIndicator.rect(-barWidth / 2, -this.ballSprite.height - 60, fillWidth, barHeight);
            this.powerIndicator.fill();
        }
    }
    setupInteraction() {
        this.on('pointerdown', this.onDragStart, this);
        this.on('pointermove', this.onDragMove, this);
        this.on('pointerup', this.onDragEnd, this);
        this.on('pointerupoutside', this.onDragEnd, this);
    }
    onDragStart(event) {
        if (this._isMoving || this._goalScored || this.gameState.gameOver)
            return;
        this._isDragging = true;
        this._dragTime = Date.now();
        this._startPos = { x: event.global.x, y: event.global.y };
    }
    onDragMove(event) {
        if (!this._isDragging)
            return;
        // Calculate power based on drag time (max 3 seconds)
        const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
        const power = (dragDuration / 3000) * 100;
        this.updatePowerIndicator(power);
    }
    onDragEnd(event) {
        if (!this._isDragging || this._goalScored || this.gameState.gameOver)
            return;
        this._isDragging = false;
        const endPos = { x: event.global.x, y: event.global.y };
        // Calculate power based on drag time (max 3 seconds)
        const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
        const powerPercent = (dragDuration / 3000) * 100;
        const powerMultiplier = 0.5 + (powerPercent / 100) * 0.5; // 0.5x to 1x multiplier
        // Calculate swipe vector (from start to end)
        const deltaX = endPos.x - this._startPos.x;
        const deltaY = endPos.y - this._startPos.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < 20 && powerPercent < 10)
            return; // Ignore very small swipes and low power
        // Calculate speed based on power and swipe distance
        const baseSpeed = Math.max(distance / 10, this._minSpeed);
        const swipeSpeed = Math.min(baseSpeed * powerMultiplier, this._maxSpeed);
        // Normalize direction vector
        const dirX = deltaX / distance;
        const dirY = deltaY / distance;
        // Add height component based on upward swipe and power
        let heightVelocity = 0;
        if (deltaY < 0) { // Upward swipe
            heightVelocity = Math.min(Math.abs(deltaY) / 3 * powerMultiplier, 25);
        }
        // Apply velocity
        this._velocity.x = dirX * swipeSpeed;
        this._velocity.y = dirY * swipeSpeed;
        this._velocity.z = heightVelocity; // Initial height velocity
        this._isMoving = true;
        // Clear indicators
        this.aimingCircle.clear();
        this.powerIndicator.clear();
        this.powerText.text = '';
        console.log(`Ball shot! Power: ${powerPercent.toFixed(1)}%, Speed: ${swipeSpeed.toFixed(2)}, Direction: (${dirX.toFixed(2)}, ${dirY.toFixed(2)}), Height: ${heightVelocity.toFixed(2)}`);
        console.log(`Balls remaining: ${this.gameState.ballsRemaining}`);
    }
    update() {
        if (!this._isMoving)
            return;
        // Simple movement
        this.x += this._velocity.x;
        this.y += this._velocity.y;
        // Apply friction
        this._velocity.x *= 0.98;
        this._velocity.y *= 0.98;
        // Stop if velocity is too low
        if (Math.abs(this._velocity.x) < 0.5 && Math.abs(this._velocity.y) < 0.5) {
            this._velocity.x = 0;
            this._velocity.y = 0;
            this._isMoving = false;
        }
        // Check boundaries and goal
        this.checkBoundaries();
        this.checkGoalCollision();
    }
    checkBoundaries() {
        const radius = this.ballSprite.width / 2;
        // Screen boundaries
        if (this.x - radius < 0 || this.x + radius > window.innerWidth) {
            this._velocity.x *= -0.8;
            this.x = Math.max(radius, Math.min(window.innerWidth - radius, this.x));
        }
        if (this.y - radius < 0 || this.y + radius > window.innerHeight) {
            this._velocity.y *= -0.8;
            this.y = Math.max(radius, Math.min(window.innerHeight - radius, this.y));
        }
    }
    checkGoalCollision() {
        // Check if ball is in goal area using the goal's zone system
        const ballPosition = { x: this.x, y: this.y };
        if (this.goal.isInGoalArea(ballPosition)) {
            // Mark as in goal for net physics and gradual stopping
            if (!this._inGoal) {
                this._inGoal = true;
                this._goalStopTimer = 0; // Reset stop timer
                console.log("Ball entered goal area!");
            }
            // Only score once
            if (!this._goalScored) {
                this._goalScored = true;
                // Get which zone the ball hit
                const hitZone = this.goal.getZoneFromPosition(ballPosition.x, ballPosition.y);
                console.log(`Goal scored in zone ${hitZone}!`);
                // Callback to game management system
                if (this.goalScoredCallback) {
                    this.goalScoredCallback(hitZone);
                }
                // Schedule ball destruction after delay
                setTimeout(() => {
                    this.destroy();
                }, 3000);
            }
        }
        else {
            this._inGoal = false; // Ball left goal area
        }
    }
    // Reset ball to initial position
    reset() {
        this.updateScale(); // This will set both scale and position
        this._velocity.x = 0;
        this._velocity.y = 0;
        this._velocity.z = 0;
        this._height = 0;
        this._isMoving = false;
        this._isDragging = false;
        this.updateBallPosition();
        this.updateShadow();
    }
    destroy(options) {
        window.removeEventListener('resize', this._onResize);
        PIXI.Ticker.shared.remove(this.onEnterFrame);
        super.destroy(options);
    }
}
