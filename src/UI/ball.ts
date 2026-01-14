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
  private _pendingGoalZone: any = null;
  private _finalGoalCounted: boolean = false;
  private _pendingSave: boolean = false;
  private _pendingSaveZone: any = null;
  private _baseScale = 1;
  private _isDragging = false;
  private _dragTime = 0; // Track drag duration for power
  private _inGoal = false; // Track if ball is inside goal
  private _snappedToZone = false; // whether last shot was snapped to a goal zone
  private _lastShotPower = 0; // store last shot power percent for animations
  private _postGoalAnimating = false;
  private _postGoalStartTime = 0;
  private _postGoalDuration = 800;
  private _postGoalAmplitude = 40;
  private _animationBaseY = 0;
  private _currentYOffset = 0;
  private _postGoalFinalY: number | null = null;
  private _startPos = { x: 0, y: 0 };
  private _minSpeed = 15;
  private _maxSpeed = 55;
  private _zoneTriggered = false;
  private _ballUsed = false; // Track if ball has been used (swiped once)
  private _firstCollisionHandled = false; // Track if first collision has been handled
  private _keeperCooldown = false; // Prevent repeated goalkeeper triggers after a deflection
  private _wasOut = false; // mark if trajectory is outbound/low_power
  private onEnterFrame: () => void;
  private _onResize: () => void;
  private _goalScored = false;
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
  public saveCallback?: () => void; // Callback for goalkeeper saves
  public outCallback?: () => void; // Callback for outbound / insufficient power shots
  public gameState: { ballsRemaining: number; gameOver: boolean };
  public goal: any;
  public goalkeeper: any;  
  constructor(gameState: { ballsRemaining: number; gameOver: boolean }, goal: any, goalkeeper?: any) {
    super();
    
    // Create ball sprite
    const tex = PIXI.Texture.from('./arts/ball.png');
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
    this.goalkeeper = goalkeeper;
    
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


  private computeDeflectionVelocity(
    ballPos: { x: number; y: number },
    keeperPos: { x: number; y: number },
    power = 2
  ) {
    // Basic deflection vector from keeper to ball
    let dx = ballPos.x - keeperPos.x;
    let dy = ballPos.y - keeperPos.y;
    let len = Math.sqrt(dx * dx + dy * dy) || 1;
    let vx = dx / len;
    let vy = dy / len;

    // If a goal object exists, bias deflection away from the goal center
    // so a keeper touch is less likely to send the ball inward into the net.
    try {
      const goalArea = this.goal?.getGoalArea && this.goal.getGoalArea();
      if (goalArea) {
        const gx = goalArea.x + goalArea.width / 2;
        const gy = goalArea.y + goalArea.height / 2;
        const toGoalX = gx - keeperPos.x;
        const toGoalY = gy - keeperPos.y;
        const dot = vx * toGoalX + vy * toGoalY;
        // If deflection is pointing toward the goal center (dot > 0), flip/adjust it
        if (dot > 0) {
          // Prefer vector away from goal center
          let awayX = keeperPos.x - gx;
          let awayY = keeperPos.y - gy;
          const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
          vx = awayX / awayLen;
          vy = awayY / awayLen;
          // add a small lateral random component to make deflections look natural
          const lateral = (Math.random() - 0.5) * 0.6;
          const latX = -vy * lateral;
          const latY = vx * lateral;
          vx += latX; vy += latY;
          const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
          vx /= vlen; vy /= vlen;
        }
      }
    } catch (e) {}

    return {
      x: vx * 40 * power,
      y: vy * 45 * power - 4
    };
  }

 
  public setVelocity(x: number, y: number) {
    this._velocity.x = x;
    this._velocity.y = y;
    this._isMoving = true;
    this.startBounceMovement();
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
    // Elevate the drop point by 0.005 * goal.y
    const goalY = this.goal?.goalSprite?.y || 0;
    const elevationOffset = 0.005 * goalY;
    this.x = window.innerWidth / 2;
    this.y = groundLevel - elevationOffset; // Position at elevated ground level
    
    // Update shadow
    this.updateShadow();
  }
  
  private updateShadow() {
    this.shadowSprite.clear();

    // Adjust shadow based on vertical offset (simulated lift)
    const yOff = this._currentYOffset || 0; // positive means lower, negative means higher
    const lift = Math.max(0, -yOff); // how high the ball is above base

    // Base shadow size from sprite texture at base scale
    const texWidth = (this.ballSprite.texture && this.ballSprite.texture.width) ? this.ballSprite.texture.width : this.ballSprite.width;
    const baseRadius = (texWidth * this._baseScale) / 2 * 0.8; // unscaled base radius at _baseScale
    // Shrink shadow when ball rises
    const shrinkFactor = 1 - Math.min(0.75, lift / Math.max(1, this._postGoalAmplitude * 1.2));
    // Factor to account for current sprite scale relative to base
    const scaleFactor = (this.ballSprite.scale && this._baseScale) ? (this.ballSprite.scale.x / this._baseScale) : 1;
    const shadowRadius = baseRadius * shrinkFactor * scaleFactor;
    const alpha = 0.35 * Math.max(0.25, shrinkFactor * scaleFactor);

    this.shadowSprite.fill(0x000000, alpha);
    // place shadow slightly below the ball, adjust with lift
    const yPos = 10 + Math.max(0, lift * 0.2);
    this.shadowSprite.ellipse(0, yPos, shadowRadius, shadowRadius * 0.5);
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
    // Prevent interaction if ball has been used, is moving, goal scored, or game over
    if (this._ballUsed || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
  }

  private onDragMove(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._ballUsed || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    const currentPos = { x: event.global.x, y: event.global.y };
    const deltaX = currentPos.x - this._startPos.x;
    const deltaY = currentPos.y - this._startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Calculate current power based on swipe speed
    const currentTime = Date.now();
    const dragDuration = Math.max(1, currentTime - this._dragTime);
    const swipeSpeed = distance * 1000 / dragDuration;
    const maxSwipeSpeed = 2000;
    const minSwipeSpeed = 100;
    const powerPercent = Math.max(0, Math.min(100, 
      ((swipeSpeed - minSwipeSpeed) / (maxSwipeSpeed - minSwipeSpeed)) * 100
    ));
    
    // Update power indicator
    this.updatePowerIndicator(powerPercent);
  }

  private onDragEnd(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._ballUsed || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = false;
    const endPos = { x: event.global.x, y: event.global.y };

    // Calculate swipe vector (from start to end)
    const deltaX = endPos.x - this._startPos.x;
    const deltaY = endPos.y - this._startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const dragDuration = Math.max(1, Date.now() - this._dragTime);
    
    // Compute swipe speed (pixels per second) - this is our power metric
    const swipePps = distance * 1000 / dragDuration; // px/s
    
    // Calculate power based on swipe speed (0-100%)
    const maxSwipeSpeed = 2000; // pixels per second for 100% power
    const minSwipeSpeed = 100;  // minimum threshold
    const powerPercent = Math.max(0, Math.min(100, 
      ((swipePps - minSwipeSpeed) / (maxSwipeSpeed - minSwipeSpeed)) * 100
    ));
    
    if (distance < 10 || powerPercent < 5) return; // ignore tiny or weak gestures
    
    // Mark ball as used and disable all future interactions
    this._ballUsed = true;
    this.interactive = false;
    this.cursor = 'default';
    const baselinePps = 1000; // tuning baseline (px/s)

    // Determine intended range based on power, swipe distance and swipe speed
    const rangeBoost = Math.max(0.8, Math.min(1.5, 1 + (swipePps - baselinePps) / (baselinePps * 2)));
    const range = Math.min(this._maxSpeed * 20, Math.max(this._minSpeed * 10, distance * (0.8 + powerPercent / 150) * rangeBoost));

    // Direction normalized
    const dirX = deltaX / distance;
    const dirY = deltaY / distance;

    // Compute target point in that direction
    let target = {
      x: this.x + dirX * range,
      y: this.y + dirY * range
    };

    // Clamp target to screen bounds (leave margin) - only for initial target calculation
    const margin = 10;
    target.x = Math.max(margin, Math.min(window.innerWidth - margin, target.x));
    target.y = Math.max(margin, Math.min(window.innerHeight - margin, target.y));

    // store last shot power for post-goal animation
    this._lastShotPower = powerPercent;

    // Predict trajectory collision and set appropriate target based on swipe direction
    const trajectoryResult = this.predictTrajectoryCollision(this.x, this.y, dirX, dirY, range);
    target = trajectoryResult.finalTarget;
    let shouldSnap = trajectoryResult.shouldSnap;

    // Handle different collision types
    switch (trajectoryResult.collisionType) {
      case 'outbound_left':
        // Fly left outward
        target = {
          x: this.x - range * 2.0,
          y: this.y + (dirY > 0 ? 0.5 : -0.5) * range
        };
        shouldSnap = false;
        this._wasOut = true;
        break;
        
      case 'outbound_right':
        // Fly right outward  
        target = {
          x: this.x + range * 2.0,
          y: this.y + (dirY > 0 ? 0.5 : -0.5) * range
        };
        shouldSnap = false;
        this._wasOut = true;
        break;
        
      case 'above_crossbar':
        // Fly upward and outward
        const aboveOutwardX = this.x < (window.innerWidth / 2) ? -0.8 : 0.8;
        target = {
          x: this.x + aboveOutwardX * range * 1.5,
          y: this.y - range * 1.8 // Strong upward
        };
        shouldSnap = false;
        this._wasOut = true;
        break;
        
      case 'low_power':
        // Stop mid-flight
        target = {
          x: this.x + dirX * (range * 0.4),
          y: this.y + dirY * (range * 0.4)
        };
        shouldSnap = false;
        this._wasOut = true;
        break;
        
      case 'normal':
      default:
        // Normal snap to goal zone if exists - keep clamp for normal shots
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
              target.x = bestZone.x + bestZone.width / 2;
              target.y = bestZone.y + bestZone.height / 2;
              shouldSnap = true;
            }
          } catch (e) {}
        }
        break;
    }

    // mark that we snapped to a zone
    this._snappedToZone = shouldSnap;

    // Recompute direction and range after potential snap
    const finalDx = target.x - this.x;
    const finalDy = target.y - this.y;
    const finalDist = Math.sqrt(finalDx * finalDx + finalDy * finalDy) || 1;
    const finalDirX = finalDx / finalDist;
    const finalDirY = finalDy / finalDist;

    // Control point: midpoint plus a perpendicular offset to create arc
    const mid = { x: (this.x + target.x) / 2, y: (this.y + target.y) / 2 };
    // Offset magnitude depends on powerPercent and swipe verticality; reduce when snapping to zone
    const snapPenalty = (this.goal && typeof this.goal.getGoalZones === 'function') ? 0.6 : 1.0;
    // make arc subtler: smaller base, weaker speed influence, lower caps
    const speedBoost = 1 + Math.max(0, (swipePps - baselinePps) / baselinePps) * 0.25; // much smaller influence
    const arcStrength = Math.min(220, ((30 + (powerPercent / 100) * 120 + Math.abs(deltaY) * 0.15) * snapPenalty * speedBoost));

    // Determine curve side based on swipe direction: if swipe moves right -> curve right, left -> curve left.
    // If mostly vertical, bias upward based on verticality and use small horizontal sign if present.
    let dirSign = 1;
    const horizVsVert = Math.abs(deltaX) / Math.max(1, Math.abs(deltaY));
    if (Math.abs(deltaX) > Math.abs(deltaY) * 0.5) {
      // clearly horizontal-leaning swipe: follow horizontal direction
      dirSign = deltaX >= 0 ? 1 : -1;
    } else {
      // mostly vertical swipe: if there's any horizontal component use its sign, otherwise default to right
      dirSign = deltaX === 0 ? 1 : (deltaX > 0 ? 1 : -1);
    }

    // Upward swipes (negative deltaY) should produce stronger upward bias
    const upBiasFactor = 0.3 + Math.min(1, Math.max(0, -deltaY) / 300) * 0.7; // 0.3 .. 1.0

    // Use the original swipe direction (dirX, dirY) to determine perpendicular vector
    // so the arc side follows the swipe regardless of snapping to targets.
    const perp = { x: -dirY * dirSign, y: dirX * dirSign };
    const extraUp = Math.abs(deltaY) * upBiasFactor + (upBiasFactor > 0.5 ? arcStrength * 0.12 : 0);

    // Bias control point toward the start so curvature is stronger at launch
    const startBias = 0.6; // 0..1, higher => control moves closer to start (more initial curve)
    const arcStartBoost = 1 + Math.min(0.25, startBias * 0.15); // small boost near start
    const arcUsed = arcStrength * arcStartBoost;
    const controlAnchor = {
      x: mid.x * (1 - startBias) + this.x * startBias,
      y: mid.y * (1 - startBias) + this.y * startBias
    };
    const control = {
      x: controlAnchor.x + perp.x * arcUsed,
      y: controlAnchor.y + perp.y * arcUsed - extraUp // bias up depending on swipe verticality
    };

    // Set curve properties
    this._curveStart = { x: this.x, y: this.y };
    this._curveControl = control;
    this._curveEnd = target;

    // Duration scales with final distance and swipe speed — faster swipe => shorter flight time
    const baseDuration = (finalDist / (this._maxSpeed * 10)) * 500;
    // speedFactor < 1 when swipe is faster than baseline (so duration shortens), >1 when slower
    let speedFactor = baselinePps / Math.max(1, swipePps);
    speedFactor = Math.max(0.5, Math.min(2.0, speedFactor));
    this._moveDuration = Math.max(120, Math.min(1400, baseDuration * speedFactor));
    this._moveStartTime = performance.now();
    this._isMoving = true;
    this._firstCollisionHandled = false; // Reset collision tracking for new flight

    // Draw and keep flight path for 5s
    this.drawFlightPath(this._curveStart, this._curveControl, this._curveEnd);

    // Clear indicators
    try { this.powerIndicator.clear(); } catch (e) {}
    this.powerText.text = '';
    
  }
  
  private update() {
    // continue if moving or post-goal animation is running
    if (!this._isMoving && !this._postGoalAnimating) return;

    const now = performance.now();
    const elapsed = now - this._moveStartTime;
    const t = Math.min(1, elapsed / this._moveDuration);

    if (this._curveStart && this._curveControl && this._curveEnd) {
      // Quadratic Bézier curve: P(t) = (1-t)² P₀ + 2(1-t)t P₁ + t² P₂
      const u = 1 - t; // (1-t)
      const u2 = u * u; // (1-t)²
      const t2 = t * t; // t²
      const twoUt = 2 * u * t; // 2(1-t)t
      
      // Apply Bézier formula for both x and y coordinates
      const nx = u2 * this._curveStart.x + twoUt * this._curveControl.x + t2 * this._curveEnd.x;
      const ny = u2 * this._curveStart.y + twoUt * this._curveControl.y + t2 * this._curveEnd.y;
      
      this.x = nx;
      this.y = ny;
      
      // Visual lift for shadow: compute deviation of curve from straight line
      const lx = this._curveStart.x + (this._curveEnd.x - this._curveStart.x) * t; // linear interp
      const ly = this._curveStart.y + (this._curveEnd.y - this._curveStart.y) * t;
      const deviation = Math.hypot(nx - lx, ny - ly);
      // Lift shadow when ball is 'higher' (negative y offset)
      this._currentYOffset = -deviation * 0.6; // negative means up for updateShadow

      // --- Scale handling (snapped -> shrink toward goal, or depth-based inside goal) ---
      try {
        if (this._snappedToZone) {
          // While flying to a snapped goal zone, interpolate scale from base to target (1/10 of goal width)
          if (this.goal && typeof this.goal.getGoalArea === 'function' && this.ballSprite.texture && this.ballSprite.texture.width) {
            try {
              const goalArea = this.goal.getGoalArea();
              if (goalArea && goalArea.width > 0) {
                const desiredPixelWidth = goalArea.width / 8; // target ball pixel width at snap (1/5 of goal)
                const desiredScale = desiredPixelWidth / this.ballSprite.texture.width;
                // Interpolate based on flight progress t so scale reduces smoothly
                const s = this.lerp(this._baseScale, desiredScale, t);
                this.ballSprite.scale.set(s, s);
              } else {
                this.ballSprite.scale.set(this._baseScale, this._baseScale);
              }
            } catch (e) { this.ballSprite.scale.set(this._baseScale, this._baseScale); }
          } else {
            this.ballSprite.scale.set(this._baseScale, this._baseScale);
          }
        } else if (this._inGoal) {
          // Depth-based scaling when ball is inside goal area (settling)
          if (this.goal && typeof this.goal.getGoalArea === 'function') {
            const goalArea = this.goal.getGoalArea();
            if (goalArea && goalArea.height > 0) {
              const depth = (this.y - goalArea.y) / goalArea.height; // 0..1 (may exceed)
              const depthClamped = Math.max(0, Math.min(1, depth));
              const depthScale = 1 - depthClamped * 0.5; // reduce up to ~50%
              const finalScale = this._baseScale * Math.max(0.6, depthScale);
              this.ballSprite.scale.set(finalScale, finalScale);
            } else {
              this.ballSprite.scale.set(this._baseScale, this._baseScale);
            }
          } else {
            this.ballSprite.scale.set(this._baseScale, this._baseScale);
          }
        } else {
          // Default size
          this.ballSprite.scale.set(this._baseScale, this._baseScale);
        }
      } catch (e) {}

      // --- Scale-based Collision System DISABLED ---
      // DISABLED: Scale-based collision causes multiple bounces
      // Using only trajectory prediction to avoid code overlap
      /*
      if (!this._zoneTriggered && !this._firstCollisionHandled) {
        try {
          const goalArea = this.goal?.getGoalArea();
          if (goalArea && this.ballSprite.texture && this.ballSprite.texture.width) {
            // Calculate current scale relative to goal
            const currentScale = this.ballSprite.scale.x;
            const ballPixelWidth = this.ballSprite.texture.width * currentScale;
            const goalRatio = ballPixelWidth / goalArea.width;
            
            // Only process collisions when ball is at 1/6 to 1/7 scale relative to goal
            if (goalRatio >= 1/7 && goalRatio <= 1/6) {
              this.checkBounceCollisions();
            }
          }
        } catch (e) {}
      }
      */

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

    // Always check goal collision during motion 
    // DISABLED: checkBoundaries() - let ball fly freely off screen
    // this.checkBoundaries();
    this.checkGoalkeeperCollision();
    this.predictGoalkeeperTiming();
    this.checkGoalCollision();

    // Finish movement
    if (t >= 1) {
      this._isMoving = false;
      
      // Check if goalkeeper should attempt catch for missed shots
      this.handleGoalkeeperForMissedShots();
      
      // Keep path visible for 5s then clear
      if (this._pathGraphics) {
        const pg = this._pathGraphics;
        this._pathGraphics = null;
        setTimeout(() => { try { pg.destroy(); } catch (e) {} }, 5000);
      }

      // clear curve points
      this._curveStart = this._curveControl = this._curveEnd = null;

      // If ball landed in goal and was snapped to a zone, start a small bounce + settle animation
      try {
        if (this._inGoal && this._snappedToZone && !this._postGoalAnimating) {
          this._postGoalAnimating = true;
          this._postGoalStartTime = performance.now();
          // amplitude based on shot power (clamped)
          this._postGoalAmplitude = Math.min(80, 10 + (this._lastShotPower / 100) * 80);
          this._postGoalDuration = 800; // ms
          this._animationBaseY = this.y; // store arrival y
          this._currentYOffset = 0;
          // compute final settle Y as bottom of goal area (so ball sinks to lowest point)
          try {
            if (this.goal && typeof this.goal.getGoalArea === 'function') {
              const goalArea = this.goal.getGoalArea();
              if (goalArea) {
                // place ball higher by 0.5 * goal.y
                const goalY = this.goal?.goalSprite?.y || 0;
                const elevationOffset = 0.055 * goalY;
                this._postGoalFinalY = goalArea.y + goalArea.height - (this.ballSprite.height / 2) - elevationOffset;
              }
            }
          } catch (e) { this._postGoalFinalY = null; }
        } else if (!this._inGoal && !this._postGoalAnimating) {
          // Non-goal landing: give a more visible gentle bounce so player notices
          this._postGoalAnimating = true;
          this._postGoalStartTime = performance.now();
          // stronger amplitude (but capped) based on shot power so stronger shots bounce more
          this._postGoalAmplitude = Math.min(40, 6 + (this._lastShotPower / 100) * 34);
          this._postGoalDuration = 600; // slightly longer so bounce is visible
          this._animationBaseY = this.y; // base is current landing y
          this._currentYOffset = 0;
          // final settle slightly lower than landing to show a small sink after bounce
          this._postGoalFinalY = this.y + Math.min(12, 2 + (this._lastShotPower / 100) * 8);
        }
      } catch (e) {}
    }
    // Update shadow based on current offset
    this.updateShadow();

    // Handle post-goal bounce/fall animation
    if (this._postGoalAnimating) {
      const now = performance.now();
      const p = Math.min(1, (now - this._postGoalStartTime) / this._postGoalDuration);
      // yOffset: bounce then settle into net. Use a damped sine for bounce.
      const bounce = -Math.sin(p * Math.PI) * this._postGoalAmplitude * (1 - p * 0.6);
      // Determine settle target Y (goal bottom) and interpolate toward it after bounce
      let settleYOffset = 0;
      if (this._postGoalFinalY !== null && this._postGoalFinalY !== undefined) {
        // compute desired final delta relative to animation base
        const desiredFinalDelta = this._postGoalFinalY - this._animationBaseY;
        // after bounce (p > 0.4) start moving towards final position
        const settleProgress = Math.min(1, Math.max(0, (p - 0.4) / 0.6));
        settleYOffset = desiredFinalDelta * settleProgress;
      } else {
        // fallback small sink
        settleYOffset = p > 0.9 ? (p - 0.9) / 0.1 * 12 : 0;
      }
      this._currentYOffset = bounce + settleYOffset;
      // Apply visual offset
      this.y = this._animationBaseY + this._currentYOffset;
      // Shadow should shrink and fade as the ball rises, then restore as it settles
      this.updateShadow();

      if (p >= 1) {
        this._postGoalAnimating = false;
        this._snappedToZone = false; // reset
        // ensure final settle at computed goal bottom if available
        if (this._postGoalFinalY !== null && this._postGoalFinalY !== undefined) {
          this.y = this._postGoalFinalY;
          this._currentYOffset = this._postGoalFinalY - this._animationBaseY;
        } else {
          this.y = this._animationBaseY + 12;
          this._currentYOffset = 12;
        }
        this._postGoalFinalY = null;
          this.updateShadow();
        // Finalize pending goal if any: only count as goal if final resting pos is inside net
        try {
          if (this._pendingGoalZone && !this._finalGoalCounted) {
            try {
              if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                if (this.goalScoredCallback) this.goalScoredCallback(this._pendingGoalZone);
                this._finalGoalCounted = true;
              }
            } catch (e) {}
            this._pendingGoalZone = null;
          }
        } catch (e) {}
        // Finalize pending save: if ball ended inside goal, treat as goal (do not count save).
        try {
          if (this._pendingSave) {
            try {
              if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                // Ball ended in net -> count as goal instead of save
                if (!this._finalGoalCounted) {
                  const zone = this.goal.getZoneFromPosition(this.x, this.y) || this._pendingSaveZone;
                  if (zone && this.goalScoredCallback) this.goalScoredCallback(zone);
                  this._finalGoalCounted = true;
                }
              } else {
                // Ball did not end in net -> count as save
                if (this.saveCallback) this.saveCallback();
              }
            } catch (e) {}
            this._pendingSave = false;
            this._pendingSaveZone = null;
          }
        } catch (e) {}
        // Notify application that this ball's flight/settle has finished so it can schedule next ball.
        // If this shot was outbound/low power, notify via outCallback before destroying
        try {
          if (this._wasOut && this.outCallback) {
            try { this.outCallback(); } catch (e) {}
          }
        } catch (e) {}
        // Always call onBallDestroyed after a short delay to allow visuals to settle
        try {
          if (this.onBallDestroyed) {
            setTimeout(() => {
              try { if (this.onBallDestroyed) this.onBallDestroyed(); } catch (e) {}
            }, 800);
          }
        } catch (e) {}
      }
    }
  }

  // Ease helper (easeOutQuad)
  private easeOutQuad(t: number) {
    return t * (2 - t);
  }

  // Linear interpolation helper
  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
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
      // Quadratic Bézier curve: P(t) = (1-t)² P₀ + 2(1-t)t P₁ + t² P₂
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const twoUt = 2 * u * t;
      const x = u2 * start.x + twoUt * control.x + t2 * end.x;
      const y = u2 * start.y + twoUt * control.y + t2 * end.y;
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
  
  

  private predictTrajectoryCollision(startX: number, startY: number, dirX: number, dirY: number, range: number) {
    if (!this.goal) {
      return { 
        collisionType: 'normal', 
        finalTarget: { x: startX + dirX * range, y: startY + dirY * range },
        shouldSnap: false,
        hitPoint: null
      };
    }

    const goalArea = this.goal.getGoalArea();
    if (!goalArea) {
      return { 
        collisionType: 'normal', 
        finalTarget: { x: startX + dirX * range, y: startY + dirY * range },
        shouldSnap: false,
        hitPoint: null
      };
    }

    // Calculate trajectory line
    const endX = startX + dirX * range;
    const endY = startY + dirY * range;

    // Only check for outbound cases and low power - Rectangle collision now handled by scale-based system
    
    // Priority 4 & 5: Check outbound areas
    const greenW = Math.max(24, Math.min(60, goalArea.width * 0.08));
    if (endX < goalArea.x - greenW - 6 && endY >= goalArea.y && endY <= goalArea.y + goalArea.height) {
      return {
        collisionType: 'outbound_left',
        finalTarget: { x: endX, y: endY },
        shouldSnap: false,
        hitPoint: null
      };
    }
    
    if (endX > goalArea.x + goalArea.width + greenW + 6 && endY >= goalArea.y && endY <= goalArea.y + goalArea.height) {
      return {
        collisionType: 'outbound_right',
        finalTarget: { x: endX, y: endY },
        shouldSnap: false,
        hitPoint: null
      };
    }

    // Priority 6: Above crossbar
    if (endY < goalArea.y && endX >= goalArea.x - 50 && endX <= goalArea.x + goalArea.width + 50) {
      return {
        collisionType: 'above_crossbar',
        finalTarget: { x: endX, y: endY },
        shouldSnap: false,
        hitPoint: null
      };
    }

    // Priority 7: Low power check
    if (this._lastShotPower < 30) {
      const distanceToGoal = Math.sqrt((goalArea.x + goalArea.width / 2 - startX) ** 2 + 
                                      (goalArea.y + goalArea.height / 2 - startY) ** 2);
      if (distanceToGoal > 200) {
        return {
          collisionType: 'low_power',
          finalTarget: { x: endX, y: endY },
          shouldSnap: false,
          hitPoint: null
        };
      }
    }

    // Priority 8: Normal behavior
    return {
      collisionType: 'normal',
      finalTarget: { x: endX, y: endY },
      shouldSnap: true,
      hitPoint: null
    };
  }

  private lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: { x: number; y: number; width: number; height: number }) {
    // Simple line-rectangle intersection check
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    // Check if line segment intersects with rectangle
    if (this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||     // top edge
        this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // right edge
        this.lineIntersectsLine(x1, y1, x2, y2, right, bottom, left, bottom) || // bottom edge
        this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, left, top)) {   // left edge
      
      // Return intersection point (approximate center of rect for simplicity)
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    
    return null;
  }

  private lineIntersectsLine(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denominator === 0) return false; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  // Helper method for rectangle intersection
  private rectIntersects(rect1: { x: number; y: number; width: number; height: number }, 
                        rect2: { x: number; y: number; width: number; height: number }) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  }

  // REMOVED: All collision handling methods
  // (handleRedZoneCollision, handleGreenZoneCollision, handleYellowZoneCollision, flyOut, snapToGoal)
  // All collision logic is now handled in trajectory prediction to prevent double flight

  // REMOVED: checkBoundaries method
  // Ball should fly freely off screen following trajectory prediction
  // Boundary collision was interfering with Bézier curve movement

  // Predict when ball will reach goal and trigger goalkeeper at the right time
  private predictGoalkeeperTiming() {
    if (!this.goalkeeper || !this._isMoving || this._goalScored || this._ballUsed || !this._curveEnd || this._keeperCooldown) {
      return;
    }

    const goalArea = this.goal?.getGoalArea();
    if (!goalArea) return;

    // Calculate if ball trajectory will hit goal area
    const currentProgress = this.getCurrentTrajectoryProgress();
    const ballToGoalDistance = Math.sqrt(
      Math.pow(this.x - (goalArea.x + goalArea.width / 2), 2) +
      Math.pow(this.y - (goalArea.y + goalArea.height / 2), 2)
    );

    // Only trigger goalkeeper when ball is close and moving toward goal
    const triggerDistance = Math.max(goalArea.width, goalArea.height) * 0.8;
    
    if (ballToGoalDistance <= triggerDistance && currentProgress > 0.6 && currentProgress < 0.9) {
      console.log(`Triggering goalkeeper at optimal timing! Progress: ${(currentProgress * 100).toFixed(1)}%, Distance: ${ballToGoalDistance.toFixed(1)}`);
      
      // Predict where ball will land
      const curveEnd = this._curveEnd!;
      const predictedZone = this.goal.getZoneFromPosition(curveEnd.x, curveEnd.y) || 
               { id: Math.floor(Math.random() * 12) + 1 };

      this._goalScored = true; // Prevent multiple attempts

      const ballRadius = this.ballSprite.width / 2;
      this.goalkeeper.attemptCatch(curveEnd.x, curveEnd.y, predictedZone, ballRadius).then((result: any) => {
        if (result.caught) {
          console.log(`🥅 Perfect timing! Goalkeeper saved in zone ${result.catchZone.id}!`);
          const catchPos = result.catchPos || { x: curveEnd.x, y: curveEnd.y };
          const def = this.computeDeflectionVelocity({ x: this.x, y: this.y }, catchPos, Math.random() * 0.6 + 0.7);
          this.setVelocity(def.x, def.y);
          // Clear outbound flag to avoid later double-counting as 'out'
          this._wasOut = false;
          // Defer save counting until we know final resting position; mark pending save
          this._pendingSave = true;
          this._pendingSaveZone = result.catchZone;

          // Prevent immediate re-triggering: set a short cooldown
          this._keeperCooldown = true;
          setTimeout(() => {
            this._keeperCooldown = false;
            this._goalScored = false;
          }, 700);
        } else {
          console.log(`🤾‍♂️ Goalkeeper attempted but missed the timing!`);
          this._goalScored = false; // Allow goal to continue
        }
      });
    }
  }

  // Get current progress along trajectory curve (0 = start, 1 = end)
  private getCurrentTrajectoryProgress(): number {
    if (!this._curveStart || !this._curveEnd || this._moveStartTime === 0) {
      return 0;
    }
    
    const elapsed = performance.now() - this._moveStartTime;
    const progress = Math.min(elapsed / this._moveDuration, 1);
    return progress;
  }

  // Check collision with goalkeeper
  private checkGoalkeeperCollision() {
    if (!this.goalkeeper || !this._isMoving || this._goalScored || this._ballUsed) {
      return;
    }

    // Get ball and goalkeeper positions
    const ballX = this.x;
    const ballY = this.y;
    const keeperX = this.goalkeeper.x;
    const keeperY = this.goalkeeper.y;
    
    // Calculate distance between ball and goalkeeper
    const distance = Math.sqrt(
      Math.pow(ballX - keeperX, 2) + 
      Math.pow(ballY - keeperY, 2)
    );
    
    // Collision radius (ball radius + goalkeeper radius)
    const ballRadius = this.ballSprite.width / 2;
    const keeperRadius = this.goalkeeper.getCollisionRadius();
    const collisionDistance = ballRadius + keeperRadius;
    
    // Check if collision occurred
    if (distance <= collisionDistance && !this._firstCollisionHandled) {
      console.log('Ball hit goalkeeper! Bouncing off...');
      this._firstCollisionHandled = true;
      
      // Calculate bounce direction (away from goalkeeper)
      const bounceAngle = Math.atan2(ballY - keeperY, ballX - keeperX);
      const bounceSpeed = 50; 
      
      // Apply bounce velocity
      this._velocity.x = Math.cos(bounceAngle) * bounceSpeed;
      this._velocity.y = Math.sin(bounceAngle) * bounceSpeed;
      
      // Update ball position to prevent sticking
      const separation = collisionDistance + 5; // Add small buffer
      this.x = keeperX + Math.cos(bounceAngle) * separation;
      this.y = keeperY + Math.sin(bounceAngle) * separation;
      
      // Stop the curve movement and switch to linear movement
      this._curveStart = this._curveControl = this._curveEnd = null;
      this._moveStartTime = 0;
      
      // Continue ball movement with bounce physics
      this.startBounceMovement();
    }
  }
  
  // Handle bounced ball movement
  private startBounceMovement() {
    const bounceUpdate = () => {
      if (!this._isMoving || this._goalScored || this._ballUsed) {
        return;
      }
      
      // Update position with velocity
      this.x += this._velocity.x;
      this.y += this._velocity.y;
      
      // Apply friction
      this._velocity.x *= 0.95;
      this._velocity.y *= 0.95;
      
      // Stop when velocity is very low
      if (Math.abs(this._velocity.x) < 0.5 && Math.abs(this._velocity.y) < 0.5) {
        this._velocity.x = 0;
        this._velocity.y = 0;
        this._isMoving = false;
        
        // Trigger ball destruction after bounce settles
        setTimeout(() => {
          // Finalize pending goal if any: only count as goal if final resting pos is inside net
          try {
            if (this._pendingGoalZone && !this._finalGoalCounted) {
              try {
                if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                  if (this.goalScoredCallback) this.goalScoredCallback(this._pendingGoalZone);
                  this._finalGoalCounted = true;
                }
              } catch (e) {}
              this._pendingGoalZone = null;
            }
          } catch (e) {}
            // Finalize pending save similarly: convert to goal if ended in net, otherwise call save
            try {
              if (this._pendingSave) {
                try {
                  if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                    if (!this._finalGoalCounted) {
                      const zone = this.goal.getZoneFromPosition(this.x, this.y) || this._pendingSaveZone;
                      if (zone && this.goalScoredCallback) this.goalScoredCallback(zone);
                      this._finalGoalCounted = true;
                    }
                  } else {
                    if (this.saveCallback) this.saveCallback();
                  }
                } catch (e) {}
                this._pendingSave = false;
                this._pendingSaveZone = null;
              }
            } catch (e) {}

            if (this.onBallDestroyed) {
              this.onBallDestroyed();
            }
        }, 1000);
        return;
      }
      
      // Continue bounce movement
      requestAnimationFrame(bounceUpdate);
    };
    
    bounceUpdate();
  }
  
  private checkGoalCollision() {
    // Check if ball is in goal area
    const ballPosition = { x: this.x, y: this.y };
    
    if (this._keeperCooldown) return; // skip while in cooldown after deflection

    if (this.goal.isInGoalArea(ballPosition.x, ballPosition.y)) {
      // Mark as in goal
      if (!this._inGoal) {
        this._inGoal = true;
        console.log("Ball entered goal area!");
      }
      
      // Only score once and trigger goalkeeper at the right moment
      if (!this._goalScored) {
        const zone = this.goal.getZoneFromPosition(ballPosition.x, ballPosition.y);
        
        // Goalkeeper attempts when ball actually enters goal area (not before)
        if (this.goalkeeper && zone) {
          console.log(`Ball in goal area! Zone: ${zone.id}, triggering goalkeeper...`);
          this._goalScored = true; // Mark as processed to prevent duplicate calls
          
          const ballRadius = this.ballSprite.width / 2;
          this.goalkeeper.attemptCatch(ballPosition.x, ballPosition.y, zone, ballRadius).then((result: any) => {
              if (result.caught) {
                console.log(`🥅 Goalkeeper saved! Deflecting ball from zone ${result.catchZone.id}!`);
                const catchPos = result.catchPos || { x: ballPosition.x, y: ballPosition.y };
                const def = this.computeDeflectionVelocity({ x: this.x, y: this.y }, catchPos, Math.random() * 0.6 + 0.7);
                this.setVelocity(def.x, def.y);
                // Prevent marking this later as an 'out'
                this._wasOut = false;
                  // Defer save counting until final resting position is known
                  this._pendingSave = true;
                  this._pendingSaveZone = result.catchZone;

                // Prevent immediate re-triggering: set a short cooldown
                this._keeperCooldown = true;
                setTimeout(() => {
                  this._keeperCooldown = false;
                  this._goalScored = false;
                }, 700);
              } else {
                // Goalkeeper attempted but failed to catch
                console.log(`🤾‍♂️ Goalkeeper dove but missed! Pending final settle for zone ${zone.id}.`);
                // Defer final scoring until ball settles; mark pending zone
                this._pendingGoalZone = zone;
                this._finalGoalCounted = false;
              }
          });
        } else {
          // No goalkeeper - defer scoring until final settle
            console.log('No goalkeeper: pending final settle for goal.');
            this._goalScored = true;
            this._pendingGoalZone = zone;
            this._finalGoalCounted = false;
        }
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
    
    // Store callback and clear it to prevent infinite loop
    const callback = this.onBallDestroyed;
    this.onBallDestroyed = undefined;
    
    if (callback) {
      callback();
    }
    
    super.destroy();
  }
  
  // Goal interaction zones are now handled inside the Goal class.
  // Zone setup, visuals and collision responses were moved to src/UI/goal.ts.

  // Handle goalkeeper catch for missed shots (outside goal area or hitting posts)
  private handleGoalkeeperForMissedShots() {
    // Avoid triggering while on cooldown after a recent goalkeeper interaction
    if (this._keeperCooldown) return;

    // Only trigger goalkeeper if ball is not in goal area and goalkeeper exists
    if (this.goalkeeper && !this._inGoal && !this._goalScored) {
      // Check if this was a "missed" shot that goalkeeper should try to catch
      const goalArea = this.goal?.getGoalArea();
      if (goalArea) {
        // Determine if ball trajectory was aimed at goal but missed
        const ballToGoalDistance = Math.sqrt(
          Math.pow(this.x - (goalArea.x + goalArea.width / 2), 2) +
          Math.pow(this.y - (goalArea.y + goalArea.height / 2), 2)
        );
        
        // If ball is reasonably close to goal area (missed shot), let goalkeeper attempt catch
        const maxCatchDistance = Math.max(goalArea.width, goalArea.height) * 1.5;
        if (ballToGoalDistance <= maxCatchDistance) {
          // Random chance for goalkeeper to catch missed shots
          const ballRadius = this.ballSprite.width / 2;
          this.goalkeeper.attemptCatch(this.x, this.y, null, ballRadius).then((result: any) => {
            if (result.caught) {
                console.log(`Goalkeeper saved a missed shot in zone ${result.catchZone.id}! Deflecting outward.`);
                const catchPos = result.catchPos || { x: this.x, y: this.y };
                const def = this.computeDeflectionVelocity({ x: this.x, y: this.y }, catchPos, Math.random() * 0.6 + 0.6);
                this.setVelocity(def.x, def.y);

                // Start cooldown to avoid immediate retriggers
                this._keeperCooldown = true;
                setTimeout(() => { this._keeperCooldown = false; }, 700);
              }
          });
        }
      }
    }
  }

  private handleZoneCollisionFromGoal(zone: any) {
    // Handle zone collision - can trigger special effects, scoring, etc.
    console.log('Ball collided with zone:', zone);
    
    // If this zone represents a scoring area and we haven't scored yet
    if (!this._goalScored && zone) {
      // Defer final scoring until ball settles — mark pending zone
      this._pendingGoalZone = zone;
      this._finalGoalCounted = false;
      this._goalScored = true;
      console.log('Pending goal through zone collision (will finalize on settle).');
    }
  }

}
// ---- Goal zone helpers added below ----

// Note: helper functions are placed after class for readability but use closure to access class methods is not possible.
// We'll instead add methods back into the class by reopening it earlier. To keep changes minimal, append new methods inside class by re-opening file region.