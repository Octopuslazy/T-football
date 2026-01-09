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
        // Add children
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
        this.shoot({ x: event.global.x, y: event.global.y });
        this.updatePowerIndicator(0);
    }
    shoot(endPos) {
        if (this._goalScored || this.gameState.gameOver)
            return;
        // Calculate direction to goal center
        const goalCenter = this.goal.getCenter();
        const dirX = goalCenter.x - this.x;
        const dirY = goalCenter.y - this.y;
        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        // Normalize direction
        const normalDirX = dirX / distance;
        const normalDirY = dirY / distance;
        // Calculate power based on drag time (max 3 seconds)
        const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
        const powerPercent = (dragDuration / 3000) * 100;
        // Set simple velocity toward goal
        const speed = this._minSpeed + (powerPercent / 100) * (this._maxSpeed - this._minSpeed);
        this._velocity.x = normalDirX * speed;
        this._velocity.y = normalDirY * speed;
        this._isMoving = true;
        // Clear indicators
        this.updatePowerIndicator(0);
        console.log(`Ball shot! Power: ${powerPercent.toFixed(1)}%, Speed: ${speed.toFixed(2)}`);
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
        // Check if ball is in goal area
        const ballPosition = { x: this.x, y: this.y };
        if (this.goal.isInGoalArea(ballPosition)) {
            // Mark as in goal
            if (!this._inGoal) {
                this._inGoal = true;
                console.log("Ball entered goal area!");
            }
            // Only score once
            if (!this._goalScored) {
                const zone = this.goal.getGoalZone(ballPosition);
                if (zone && this.goalScoredCallback) {
                    this.goalScoredCallback(zone);
                }
                this._goalScored = true;
                console.log('GOAL!');
            }
        }
        else {
            this._inGoal = false;
        }
    }
    get ballSize() {
        return this.ballSprite.width;
    }
    get height() {
        return 0; // No height in simple version
    }
    destroy() {
        PIXI.Ticker.shared.remove(this.onEnterFrame);
        window.removeEventListener('resize', this._onResize);
        if (this.onBallDestroyed) {
            this.onBallDestroyed();
        }
        super.destroy();
    }
}
