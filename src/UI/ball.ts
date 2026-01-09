import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../constant/global.js';

export default class Ball extends PIXI.Container {
  private ballSprite: PIXI.Sprite;
  private shadowSprite: PIXI.Graphics;
  private aimingCircle: PIXI.Graphics;
  private powerIndicator: PIXI.Graphics;
  private powerText: PIXI.Text;
  private _velocity = { x: 0, y: 0, z: 0 }; // Added z for height
  private _height = 0; // Current height above ground
  private _gravity = 1; // Stronger gravity for more realistic arc
  private _bounceStrength = 0.6; // Less bouncy for more realistic effect
  private _friction = 0.98;
  private _airResistance = 0.995; // Friction when in air
  private _isMoving = false;
  private _isDragging = false;
  private _dragTime = 0; // Track drag duration for power
  private _startPos = { x: 0, y: 0 };
  private _minSpeed = 15;
  private _maxSpeed = 45;
  private _baseScale = 1.2; // Store original scale for perspective calculation
  private onEnterFrame: () => void;
  private _onResize: () => void;
  private _goalScored = false;
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
  public gameState: { ballsRemaining: number; gameOver: boolean };
  public goal: any;  
  constructor(gameState: { ballsRemaining: number; gameOver: boolean }, goal: any) {
    super();
    
    // Create ball sprite
    const tex = PIXI.Texture.from('/Assets/arts/ball.png');
    this.ballSprite = new PIXI.Sprite(tex);
    this.ballSprite.anchor.set(0.5, 1); // mid-bottom
    
    // Create shadow
    this.shadowSprite = new PIXI.Graphics();
    
    // Create aiming circle (like in the reference image)
    this.aimingCircle = new PIXI.Graphics();
    
    // Create power indicator
    this.powerIndicator = new PIXI.Graphics();
    this.powerText = new PIXI.Text('Lực: 0%', {
      fontFamily: 'Arial',
      fontSize: 20,
      fill: 0xFFFFFF,
      fontWeight: 'bold'
    });
    this.powerText.anchor.set(0.5);
    
    // Add children (shadow first, then ball, then indicators)
    this.addChild(this.shadowSprite);
    this.addChild(this.aimingCircle);
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
    } else {
      // If texture isn't loaded yet, wait for it
      this.ballSprite.texture.on('update', () => this.updateScale());
    }
    
    this.setupInteraction();
    
    // Update loop
    this.onEnterFrame = this.update.bind(this);
    PIXI.Ticker.shared.add(this.onEnterFrame);
  }
  
  private updateScale() {
    if (!this.ballSprite.texture || !this.ballSprite.texture.width) return;
    
    // Scale ball to be 1/15 of screen width (consistent proportion)
    const targetWidth = window.innerWidth / 6;
    const s = targetWidth / this.ballSprite.texture.width;
    this._baseScale = s; // Store base scale
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
  
  private updateBallPosition() {
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
  
  private updateShadow() {
    this.shadowSprite.clear();
    
    if (this._height > 0) {
      // Draw shadow that gets smaller and more transparent as ball goes higher
      const shadowScale = Math.max(0.3, 1 - (this._height * 0.002));
      const shadowAlpha = Math.max(0.2, 1 - (this._height * 0.003));
      const shadowRadius = (this.ballSprite.width / 2) * shadowScale;
      
      this.shadowSprite.beginFill(0x000000, shadowAlpha * 0.3);
      this.shadowSprite.drawEllipse(0, 0, shadowRadius, shadowRadius * 0.5); // Oval shadow
      this.shadowSprite.endFill();
    }
  }
  
  private updateAimingCircle() {
    this.aimingCircle.clear();
    
    if (this._isDragging && !this._isMoving) {
      // Draw red aiming circle around ball (like in reference image)
      const radius = this.ballSprite.width / 2 + 15;
      this.aimingCircle.lineStyle(4, 0xFF0000, 0.8);
      this.aimingCircle.drawCircle(0, 0, radius);
      
      // Add pulsing effect
      const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.1;
      this.aimingCircle.scale.set(pulse);
    }
  }
  
  private updatePowerIndicator(power: number) {
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
      this.powerIndicator.beginFill(0x333333, 0.8);
      this.powerIndicator.drawRect(-barWidth/2, -this.ballSprite.height - 60, barWidth, barHeight);
      this.powerIndicator.endFill();
      
      // Power fill (color changes based on power level)
      const color = power < 33 ? 0x00FF00 : power < 66 ? 0xFFFF00 : 0xFF0000;
      this.powerIndicator.beginFill(color, 0.9);
      this.powerIndicator.drawRect(-barWidth/2, -this.ballSprite.height - 60, fillWidth, barHeight);
      this.powerIndicator.endFill();
    }
  }
  
  private setupInteraction() {
    this.on('pointerdown', this.onDragStart, this);
    this.on('pointermove', this.onDragMove, this);
    this.on('pointerup', this.onDragEnd, this);
    this.on('pointerupoutside', this.onDragEnd, this);
  }
  
  private onDragStart(event: PIXI.FederatedPointerEvent) {
    if (this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
    this.updateAimingCircle();
  }
  
  private onDragMove(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging) return;
    
    // Calculate power based on drag time (max 3 seconds)
    const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
    const power = (dragDuration / 3000) * 100;
    
    this.updateAimingCircle();
    this.updatePowerIndicator(power);
  }
  
  private onDragEnd(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._goalScored || this.gameState.gameOver) return;
    
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
    
    if (distance < 20 && powerPercent < 10) return; // Ignore very small swipes and low power
    
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
  
  private update() {
    if (!this._isMoving) return;
    
    // Update height with gravity
    this._velocity.z -= this._gravity;
    this._height += this._velocity.z;
    
    // Ground collision (bounce)
    if (this._height <= 0) {
      this._height = 0;
      if (this._velocity.z < 0) {
        this._velocity.z = -this._velocity.z * this._bounceStrength; // Bounce with energy loss
        
        // If bounce is too weak, stop bouncing
        if (this._velocity.z < 2) {
          this._velocity.z = 0;
        }
      }
    }
    
    // Update horizontal position
    this.x += this._velocity.x;
    this.y += this._velocity.y;
    
    // Apply friction (less when in air)
    const frictionMultiplier = this._height > 0 ? this._airResistance : this._friction;
    this._velocity.x *= frictionMultiplier;
    this._velocity.y *= frictionMultiplier;
    
    // Update visual position and shadow
    this.updateBallPosition();
    this.updateShadow();
    
    // Stop if velocity is too low and ball is on ground
    if (this._height <= 0 && Math.abs(this._velocity.x) < 0.1 && Math.abs(this._velocity.y) < 0.1 && Math.abs(this._velocity.z) < 0.1) {
      this._velocity.x = 0;
      this._velocity.y = 0;
      this._velocity.z = 0;
      this._isMoving = false;
    }
    
    // Check boundaries and collisions
    this.checkGoalPostCollisions();
    this.checkGoalCollision();
  }
  
  private checkGoalPostCollisions() {
    if (!this.goal) return;
    
    const ballRadius = this.ballSprite.width / 2;
    const ballRect = {
      x: this.x - ballRadius,
      y: this.y - this.ballSprite.height - this._height, // Account for height
      width: ballRadius * 2,
      height: this.ballSprite.height
    };
    
    const collisionRects = this.goal.getCollisionRects();
    
    for (const rect of collisionRects) {
      if (this.isColliding(ballRect, rect)) {
        this.handlePostCollision(ballRect, rect);
        break; // Only handle one collision per frame
      }
    }
  }
  
  private isColliding(ball: any, rect: any) {
    return ball.x < rect.x + rect.width &&
           ball.x + ball.width > rect.x &&
           ball.y < rect.y + rect.height &&
           ball.y + ball.height > rect.y;
  }
  
  private handlePostCollision(ballRect: any, postRect: any) {
    const ballCenterX = ballRect.x + ballRect.width / 2;
    const ballCenterY = ballRect.y + ballRect.height / 2;
    const postCenterX = postRect.x + postRect.width / 2;
    const postCenterY = postRect.y + postRect.height / 2;
    
    const deltaX = ballCenterX - postCenterX;
    const deltaY = ballCenterY - postCenterY;
    
    // Determine collision side based on overlap
    const overlapX = Math.min(ballRect.x + ballRect.width - postRect.x, postRect.x + postRect.width - ballRect.x);
    const overlapY = Math.min(ballRect.y + ballRect.height - postRect.y, postRect.y + postRect.height - ballRect.y);
    
    const bounceStrength = 0.8; // Energy retention after bounce
    
    if (overlapX < overlapY) {
      // Horizontal collision (left/right sides)
      this._velocity.x = -this._velocity.x * bounceStrength;
      // Separate ball from post
      if (deltaX > 0) {
        this.x = postRect.x + postRect.width + ballRect.width / 2 + 1;
      } else {
        this.x = postRect.x - ballRect.width / 2 - 1;
      }
    } else {
      // Vertical collision (top/bottom sides)  
      this._velocity.y = -this._velocity.y * bounceStrength;
      // Separate ball from post
      if (deltaY > 0) {
        this.y = postRect.y + postRect.height + 1;
      } else {
        this.y = postRect.y - 1;
      }
    }
    
    console.log("Ball bounced off goal post!");
    this.checkGoalCollision();
  }
  
  private checkBoundaries() {
    const radius = this.width / 2;
    
    // Screen boundaries
    if (this.x - radius < 0 || this.x + radius > window.innerWidth) {
      this._velocity.x *= -0.7; // Bounce with energy loss
      this.x = Math.max(radius, Math.min(window.innerWidth - radius, this.x));
    }
    
    if (this.y - radius < 0 || this.y + radius > window.innerHeight) {
      this._velocity.y *= -0.7;
      this.y = Math.max(radius, Math.min(window.innerHeight - radius, this.y));
    }
  }
  
  private checkGoalCollision() {
    if (this._goalScored) return;
    
    // Check if ball is in goal area using the goal's zone system
    const ballPosition = { x: this.x, y: this.y };
    
    if (this.goal.isInGoalArea(ballPosition)) {
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
  
  // Reset ball to initial position
  public reset() {
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
  
  public destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    PIXI.Ticker.shared.remove(this.onEnterFrame);
    super.destroy(options);
  }
}