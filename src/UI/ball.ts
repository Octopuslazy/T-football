import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../constant/global.js';

export default class Ball extends PIXI.Container {
  private ballSprite: PIXI.Sprite;
  private shadowSprite: PIXI.Graphics;
  private powerIndicator: PIXI.Graphics;
  private powerText: PIXI.Text;
  private _placeholder: PIXI.Graphics | null = null;
  private _velocity = { x: 0, y: 0 }; // Simple 2D velocity
  // Curve flight properties
  private _curveStart: { x: number; y: number } | null = null;
  private _curveControl: { x: number; y: number } | null = null;
  private _curveEnd: { x: number; y: number } | null = null;
  private _moveStartTime = 0;
  private _moveDuration = 800; // ms, will scale with power/distance
  private _pathGraphics: PIXI.Graphics | null = null;
  private _isMoving = false;
  private _baseScale = 1;
  private _isDragging = false;
  private _dragTime = 0; // Track drag duration for power
  private _inGoal = false; // Track if ball is inside goal
  private _startPos = { x: 0, y: 0 };
  private _minSpeed = 35;
  private _maxSpeed = 55;
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
    } else {
      // If texture isn't loaded yet, show placeholder and wait for update
      this._placeholder = new PIXI.Graphics();
      this._placeholder.fill(0xFFFFFF, 1);
      this._placeholder.circle(0, 0, 24);
      this._placeholder.fill();
      this.addChildAt(this._placeholder, 0);
      this.ballSprite.texture.on('update', () => {
        try { if (this._placeholder) { this.removeChild(this._placeholder); this._placeholder.destroy(); this._placeholder = null; } } catch(e){}
        this.updateScale();
      });
    }
    
    this.setupInteraction();
    
    // Update loop
    this.onEnterFrame = this.update.bind(this);
    PIXI.Ticker.shared.add(this.onEnterFrame);
  }
  
  private updateScale() {
    if (!this.ballSprite.texture || !this.ballSprite.texture.width) return;
    
    // Scale ball to be 1/20 of screen width
    const targetWidth = window.innerWidth / 5;
    const s = targetWidth / this.ballSprite.texture.width;
    this._baseScale = s;
    this.ballSprite.scale.set(s, s);
    
    // Position ball on ground level (3/4 down from top)
    const groundLevel = (window.innerHeight * 3) / 4;
    this.x = window.innerWidth / 2;
    this.y = groundLevel; // Position at ground level
    
    // Update shadow
    this.updateShadow();
  }
  
  private updateShadow() {
    this.shadowSprite.clear();
    
    // Draw simple oval shadow under ball
    const shadowRadius = this.ballSprite.width / 2 * 0.8;
    this.shadowSprite.fill(0x000000, 0.3);
    this.shadowSprite.ellipse(0, 10, shadowRadius, shadowRadius * 0.5); // Oval shadow, slightly below ball
    this.shadowSprite.fill();
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
      this.powerIndicator.fill(0x333333, 0.8);
      this.powerIndicator.rect(-barWidth/2, -this.ballSprite.height - 60, barWidth, barHeight);
      this.powerIndicator.fill();
      
      // Power fill (color changes based on power level)
      const color = power < 33 ? 0x00FF00 : power < 66 ? 0xFFFF00 : 0xFF0000;
      this.powerIndicator.fill(color, 0.9);
      this.powerIndicator.rect(-barWidth/2, -this.ballSprite.height - 60, fillWidth, barHeight);
      this.powerIndicator.fill();
    }
  }
  
  private setupInteraction() {
    this.on('pointerdown', (e: PIXI.FederatedPointerEvent) => this.onDragStart(e));
    this.on('pointermove', (e: PIXI.FederatedPointerEvent) => this.onDragMove(e));
    this.on('pointerup', (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
    this.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => this.onDragEnd(e));
  }
  
  private onDragStart(event: PIXI.FederatedPointerEvent) {
    if (this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
  }

  private onDragMove(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    // Calculate power based on drag time
    const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
    const powerPercent = (dragDuration / 3000) * 100;
    
    // Update power indicator
    this.updatePowerIndicator(powerPercent);
  }

  private onDragEnd(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = false;
    const endPos = { x: event.global.x, y: event.global.y };

    // Calculate power based on drag time (max 3 seconds)
    const dragDuration = Math.min(Date.now() - this._dragTime, 3000);
    const powerPercent = (dragDuration / 3000) * 100;

    // Calculate swipe vector (from start to end)
    const deltaX = endPos.x - this._startPos.x;
    const deltaY = endPos.y - this._startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance < 10 && powerPercent < 5) return; // ignore tiny gestures

    // Determine intended range based on power and swipe distance
    const range = Math.min(this._maxSpeed * 20, Math.max(this._minSpeed * 10, distance * (0.8 + powerPercent / 150)));

    // Direction normalized
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;

    // Compute target point in that direction
    const target = {
      x: this.x + dirX * range,
      y: this.y + dirY * range
    };

    // Clamp target to screen bounds (leave margin)
    const margin = 10;
    target.x = Math.max(margin, Math.min(window.innerWidth - margin, target.x));
    target.y = Math.max(margin, Math.min(window.innerHeight - margin, target.y));

    // If goal exists, snap target to nearest goal-zone center (red circles)
    if (this.goal && typeof this.goal.getGoalZones === 'function') {
      try {
        const zones = this.goal.getGoalZones();
        if (zones && zones.length) {
          let bestZone = zones[0];
          let bestDist = Infinity;
          for (const z of zones) {
            const cx = z.x + z.width / 2;
            const cy = z.y + z.height / 2;
            const d = Math.hypot(target.x - cx, target.y - cy);
            if (d < bestDist) { bestDist = d; bestZone = z; }
          }
          // Snap target to the chosen zone center
          target.x = bestZone.x + bestZone.width / 2;
          target.y = bestZone.y + bestZone.height / 2;
        }
      } catch (e) {}
    }

    // Recompute direction and range after potential snap
    const finalDx = target.x - this.x;
    const finalDy = target.y - this.y;
    const finalDist = Math.sqrt(finalDx * finalDx + finalDy * finalDy) || 1;
    const finalDirX = finalDx / finalDist;
    const finalDirY = finalDy / finalDist;

    // Control point: midpoint plus a perpendicular offset to create arc
    const mid = { x: (this.x + target.x) / 2, y: (this.y + target.y) / 2 };
    // Perp vector (based on final direction)
    const perp = { x: -finalDirY, y: finalDirX };
    // Offset magnitude depends on powerPercent and swipe verticality; reduce when snapping to zone
    const snapPenalty = (this.goal && typeof this.goal.getGoalZones === 'function') ? 0.6 : 1.0;
    const arcStrength = Math.min(300, (50 + (powerPercent / 100) * 250 + Math.abs(deltaY) * 0.2) * snapPenalty);
    const control = {
      x: mid.x + perp.x * arcStrength,
      y: mid.y + perp.y * arcStrength - Math.abs(deltaY) * 0.3 // bias up if swipe upward
    };

    // Set curve properties
    this._curveStart = { x: this.x, y: this.y };
    this._curveControl = control;
    this._curveEnd = target;

    // Duration scales with final distance and power — keep snappy
    this._moveDuration = Math.max(200, Math.min(1400, (finalDist / (this._maxSpeed * 10)) * 500));
    this._moveStartTime = performance.now();
    this._isMoving = true;

    // Draw and keep flight path for 5s
    this.drawFlightPath(this._curveStart, this._curveControl, this._curveEnd);

    // Clear indicators
    try { this.powerIndicator.clear(); } catch (e) {}
    this.powerText.text = '';

    console.log(`Ball shot (curve). Power: ${powerPercent.toFixed(1)}%, Range: ${range.toFixed(1)}, Duration: ${this._moveDuration}ms`);
    
  }
  
  private update() {
    if (!this._isMoving) return;

    const now = performance.now();
    const elapsed = now - this._moveStartTime;
    const t = Math.min(1, elapsed / this._moveDuration);

    if (this._curveStart && this._curveControl && this._curveEnd) {
      // Quadratic Bezier interpolation
      const nx = this.quadraticBezier(this._curveStart.x, this._curveControl.x, this._curveEnd.x, t);
      const ny = this.quadraticBezier(this._curveStart.y, this._curveControl.y, this._curveEnd.y, t);
      this.x = nx;
      this.y = ny;
    } else {
      // Fallback to linear velocity if curve missing
      this.x += this._velocity.x;
      this.y += this._velocity.y;
      this._velocity.x *= 0.98;
      this._velocity.y *= 0.98;
      if (Math.abs(this._velocity.x) < 0.5 && Math.abs(this._velocity.y) < 0.5) {
        this._velocity.x = 0;
        this._velocity.y = 0;
        this._isMoving = false;
      }
    }

    // Always check goal/bounds during motion
    this.checkBoundaries();
    this.checkGoalCollision();

    // Finish movement
    if (t >= 1) {
      this._isMoving = false;
      // Keep path visible for 5s then clear
      if (this._pathGraphics) {
        const pg = this._pathGraphics;
        this._pathGraphics = null;
        setTimeout(() => { try { pg.destroy(); } catch (e) {} }, 5000);
      }
      // clear curve points
      this._curveStart = this._curveControl = this._curveEnd = null;
    }
    // Scale ball gradually when nearing goal
    try {
      if (this.goal && this._baseScale) {
        const goalArea = this.goal.getGoalArea();
        if (goalArea) {
          const goalCenterX = goalArea.x + goalArea.width / 2;
          const goalCenterY = goalArea.y + goalArea.height / 2;
          const dx = this.x - goalCenterX;
          const dy = this.y - goalCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = Math.max(window.innerWidth, window.innerHeight) * 0.5; // start scaling within half-screen
          const tscale = Math.max(0, Math.min(1, dist / maxDist));
          const scaleMultiplier = 0.7 + tscale * (1 - 0.7); // 0.7 .. 1.0
          this.ballSprite.scale.set(this._baseScale * scaleMultiplier, this._baseScale * scaleMultiplier);
          // update shadow to match
          this.updateShadow();
        }
      }
    } catch (e) {}
  }

  // Quadratic bezier helper
  private quadraticBezier(p0: number, p1: number, p2: number, t: number) {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  // Draw flight path as a stroked curve and keep reference
  private drawFlightPath(start: { x: number; y: number }, control: { x: number; y: number }, end: { x: number; y: number }) {
    // Clear existing
    if (this._pathGraphics) { try { this._pathGraphics.destroy(); } catch (e) {} }
    const g = new PIXI.Graphics();
    g.lineStyle(4, 0x00FF00, 0.6);
    const segments = 48;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = this.quadraticBezier(start.x, control.x, end.x, t);
      const y = this.quadraticBezier(start.y, control.y, end.y, t);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    // Add to scene root (parent of ball) so it's visible under/over as desired
    if (this.parent) this.parent.addChild(g);
    this._pathGraphics = g;
    // schedule removal in 5s (if movement finishes earlier this will be kept then destroyed)
    setTimeout(() => {
      if (this._pathGraphics === g) {
        try { g.destroy(); } catch (e) {}
        if (this._pathGraphics === g) this._pathGraphics = null;
      }
    }, 5000);
  }
  
  private checkBoundaries() {
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
  
  private checkGoalCollision() {
    // Check if ball is in goal area
    const ballPosition = { x: this.x, y: this.y };
    
    if (this.goal.isInGoalArea(ballPosition.x, ballPosition.y)) {
      // Mark as in goal
      if (!this._inGoal) {
        this._inGoal = true;
        console.log("Ball entered goal area!");
      }
      
      // Only score once
      if (!this._goalScored) {
        const zone = this.goal.getZoneFromPosition(ballPosition.x, ballPosition.y);
        if (zone && this.goalScoredCallback) {
          this.goalScoredCallback(zone);
        }
        this._goalScored = true;
        console.log('GOAL!');
      }
    } else {
      this._inGoal = false;
    }
  }

  get ballSize() {
    return this.ballSprite.width;
  }
  
  get height() {
    return 0; // No height in simple version
  }
  
  public destroy() {
    PIXI.Ticker.shared.remove(this.onEnterFrame);
    window.removeEventListener('resize', this._onResize);
    if (this.onBallDestroyed) {
      this.onBallDestroyed();
    }
    super.destroy();
  }
}