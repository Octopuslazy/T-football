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
    if (this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
    this._isDragging = true;
    this._dragTime = Date.now();
    this._startPos = { x: event.global.x, y: event.global.y };
  }

  private onDragMove(event: PIXI.FederatedPointerEvent) {
    if (!this._isDragging || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
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
    if (!this._isDragging || this._isMoving || this._goalScored || this.gameState.gameOver) return;
    
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

    // Clamp target to screen bounds (leave margin)
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
      case 'red_crossbar':
        // Bounce back opposite direction
        target = {
          x: this.x - dirX * (range * 0.8),
          y: this.y - dirY * (range * 0.8)
        };
        shouldSnap = false;
        break;
        
      case 'green_zone':
        // 90° outward bounce
        const isLeft = trajectoryResult.hitPoint!.x < (this.goal?.getGoalArea()?.x + (this.goal?.getGoalArea()?.width || 0) / 2);
        const outwardX = isLeft ? -1 : 1;
        const outwardY = Math.abs(dirX) > Math.abs(dirY) ? 0 : (dirY > 0 ? 1 : -1);
        target = {
          x: this.x + outwardX * range * 0.7,
          y: this.y + outwardY * range * 0.6
        };
        shouldSnap = false;
        break;
        
      case 'yellow_zone':
        // 60° toward goal + random snap
        if (this.goal && typeof this.goal.getGoalZones === 'function') {
          const zones = this.goal.getGoalZones();
          if (zones && zones.length) {
            const randomZone = zones[Math.floor(Math.random() * zones.length)];
            target = {
              x: randomZone.x + randomZone.width / 2,
              y: randomZone.y + randomZone.height / 2
            };
            shouldSnap = true;
          }
        }
        break;
        
      case 'outbound_left':
      case 'outbound_right':
      case 'above_crossbar':
        // Fly outward, no snap
        shouldSnap = false;
        break;
        
      case 'low_power':
        // Stop mid-flight
        target = {
          x: this.x + dirX * (range * 0.4),
          y: this.y + dirY * (range * 0.4)
        };
        shouldSnap = false;
        break;
        
      case 'normal':
      default:
        // Normal snap to goal zone if exists
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

    // Draw and keep flight path for 5s
    this.drawFlightPath(this._curveStart, this._curveControl, this._curveEnd);

    // Clear indicators
    try { this.powerIndicator.clear(); } catch (e) {}
    this.powerText.text = '';

    console.log(`Ball shot (curve). Power: ${powerPercent.toFixed(1)}%, Range: ${range.toFixed(1)}, Duration: ${this._moveDuration}ms`);
    
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

      // --- Bounce Priority Collision System ---
      try {
        this.checkBounceCollisions();
      } catch (e) {}

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
                // place ball so its bottom rests at goalArea bottom
                this._postGoalFinalY = goalArea.y + goalArea.height - (this.ballSprite.height / 2);
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
  
  private checkBounceCollisions() {
    if (!this.goal || this._zoneTriggered) return;

    const goalArea = this.goal.getGoalArea();
    if (!goalArea) return;

    // Current velocity direction
    const velX = this._curveEnd ? this._curveEnd.x - this.x : this._velocity.x;
    const velY = this._curveEnd ? this._curveEnd.y - this.y : this._velocity.y;
    const velMag = Math.sqrt(velX * velX + velY * velY);
    if (velMag === 0) return;

    const velNormX = velX / velMag;
    const velNormY = velY / velMag;

    // Priority 1: Red rectangle (crossbar area) - bounce back opposite direction
    const crossbarY = goalArea.y;
    const crossbarHeight = 40; // Match the crossbar height from goal.ts
    if (this.x >= goalArea.x && this.x <= goalArea.x + goalArea.width &&
        this.y >= crossbarY && this.y <= crossbarY + crossbarHeight) {
      this.triggerBounce(-velNormX, -velNormY, 0.8);
      return;
    }

    // Priority 2: Green rectangles - 90° outward bounce
    if (this.goal.getInteractionZoneAt) {
      const iz = this.goal.getInteractionZoneAt(this.x, this.y);
      if (iz && iz.type === 'green') {
        // Determine if left or right green zone
        const isLeftGreen = this.x < goalArea.x;
        // 90° outward bounce
        const outwardX = isLeftGreen ? -1 : 1;
        const outwardY = Math.abs(velNormX) > Math.abs(velNormY) ? 0 : (velNormY > 0 ? 1 : -1);
        this.triggerBounce(outwardX * 0.8, outwardY * 0.6, 0.7);
        return;
      }
    }

    // Priority 3: Yellow rectangles - 60° toward goal + random snap
    if (this.goal.getInteractionZoneAt) {
      const iz = this.goal.getInteractionZoneAt(this.x, this.y);
      if (iz && iz.type === 'yellow') {
        // 60° bounce toward goal center with random snap target
        const goalCenterX = goalArea.x + goalArea.width / 2;
        const goalCenterY = goalArea.y + goalArea.height / 2;
        
        // Vector toward goal center
        const toGoalX = goalCenterX - this.x;
        const toGoalY = goalCenterY - this.y;
        const toGoalMag = Math.sqrt(toGoalX * toGoalX + toGoalY * toGoalY);
        
        if (toGoalMag > 0) {
          const toGoalNormX = toGoalX / toGoalMag;
          const toGoalNormY = toGoalY / toGoalMag;
          
          // 60° angle adjustment (mix with original velocity)
          const angle60 = Math.PI / 3; // 60 degrees
          const bounceX = velNormX * Math.cos(angle60) + toGoalNormX * Math.sin(angle60);
          const bounceY = velNormY * Math.cos(angle60) + toGoalNormY * Math.sin(angle60);
          
          // Select random goal zone for snap
          try {
            const zones = this.goal.getGoalZones();
            if (zones && zones.length) {
              const randomZone = zones[Math.floor(Math.random() * zones.length)];
              const targetX = randomZone.x + randomZone.width / 2;
              const targetY = randomZone.y + randomZone.height / 2;
              
              // Update curve end to random zone
              this._curveEnd = { x: targetX, y: targetY };
              this._snappedToZone = true;
            }
          } catch (e) {}
          
          this.triggerBounce(bounceX, bounceY, 0.6);
          return;
        }
      }
    }

    // Priority 4: Left of left green rectangle - fly outward (no snap)
    const greenW = Math.max(24, Math.min(60, goalArea.width * 0.08));
    const leftGreenLeft = goalArea.x - greenW - 6;
    if (this.x < leftGreenLeft && this.y >= goalArea.y && this.y <= goalArea.y + goalArea.height) {
      this.triggerOutwardFlight(-1, velNormY);
      return;
    }

    // Priority 5: Right of right green rectangle - fly outward (no snap)
    const rightGreenRight = goalArea.x + goalArea.width + greenW + 6;
    if (this.x > rightGreenRight && this.y >= goalArea.y && this.y <= goalArea.y + goalArea.height) {
      this.triggerOutwardFlight(1, velNormY);
      return;
    }

    // Priority 6: Above red crossbar - fly outward
    if (this.y < goalArea.y && this.x >= goalArea.x - 50 && this.x <= goalArea.x + goalArea.width + 50) {
      const outX = this.x < goalArea.x + goalArea.width / 2 ? -0.7 : 0.7;
      this.triggerOutwardFlight(outX, -0.8);
      return;
    }

    // Priority 7: Not enough power - stop mid-flight
    if (this._lastShotPower < 30 && this._isMoving) {
      const distanceToGoal = Math.sqrt((goalArea.x + goalArea.width / 2 - this.x) ** 2 + 
                                      (goalArea.y + goalArea.height / 2 - this.y) ** 2);
      if (distanceToGoal > 200) {
        this.stopMidFlight();
        return;
      }
    }

    // Priority 8: Default - normal snap behavior (existing zone collision system)
    if (this.goal.getInteractionZoneAt) {
      const iz = this.goal.getInteractionZoneAt(this.x, this.y);
      if (iz && !this._zoneTriggered) {
        this._zoneTriggered = true;
        this.handleZoneCollisionFromGoal(iz);
        setTimeout(() => { try { this._zoneTriggered = false; } catch (e) {} }, 800);
      }
    }
  }

  private triggerBounce(dirX: number, dirY: number, dampening: number) {
    this._zoneTriggered = true;
    
    // Calculate new target based on bounce direction
    const bounceDistance = 300;
    const newTargetX = this.x + dirX * bounceDistance;
    const newTargetY = this.y + dirY * bounceDistance;
    
    // Clamp to screen bounds
    const margin = 50;
    const clampedX = Math.max(margin, Math.min(window.innerWidth - margin, newTargetX));
    const clampedY = Math.max(margin, Math.min(window.innerHeight - margin, newTargetY));
    
    // Update curve end and restart movement
    this._curveEnd = { x: clampedX, y: clampedY };
    this._moveDuration = this._moveDuration * dampening;
    this._moveStartTime = performance.now();
    this._snappedToZone = false; // Disable snap for bounces
    
    console.log(`Ball bounced: direction (${dirX.toFixed(2)}, ${dirY.toFixed(2)})`);
    
    setTimeout(() => { try { this._zoneTriggered = false; } catch (e) {} }, 1000);
  }

  private triggerOutwardFlight(dirX: number, dirY: number) {
    this._zoneTriggered = true;
    
    // Fly outward with no snap
    const outwardDistance = 400;
    const newTargetX = this.x + dirX * outwardDistance;
    const newTargetY = this.y + dirY * outwardDistance;
    
    // Don't clamp - allow ball to fly off screen
    this._curveEnd = { x: newTargetX, y: newTargetY };
    this._moveStartTime = performance.now();
    this._snappedToZone = false;
    
    console.log(`Ball flying outward: direction (${dirX.toFixed(2)}, ${dirY.toFixed(2)})`);
    
    setTimeout(() => { try { this._zoneTriggered = false; } catch (e) {} }, 1000);
  }

  private stopMidFlight() {
    console.log("Ball stopped mid-flight due to insufficient power");
    this._isMoving = false;
    this._snappedToZone = false;
    this._curveStart = this._curveControl = this._curveEnd = null;
    
    // Start gentle settle animation
    this._postGoalAnimating = true;
    this._postGoalStartTime = performance.now();
    this._postGoalAmplitude = 20;
    this._postGoalDuration = 400;
    this._animationBaseY = this.y;
    this._currentYOffset = 0;
    this._postGoalFinalY = this.y + 10; // Small settle
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

    // Priority 1: Check red crossbar collision
    const crossbarY = goalArea.y;
    const crossbarHeight = 40;
    const crossbarRect = {
      x: goalArea.x,
      y: crossbarY,
      width: goalArea.width,
      height: crossbarHeight
    };
    
    const crossbarHit = this.lineIntersectsRect(startX, startY, endX, endY, crossbarRect);
    if (crossbarHit) {
      return {
        collisionType: 'red_crossbar',
        finalTarget: { x: endX, y: endY },
        shouldSnap: false,
        hitPoint: crossbarHit
      };
    }

    // Priority 2: Check green zone collision
    const greenW = Math.max(24, Math.min(60, goalArea.width * 0.08));
    const leftGreenRect = {
      x: goalArea.x - greenW - 6,
      y: goalArea.y,
      width: greenW,
      height: goalArea.height
    };
    const rightGreenRect = {
      x: goalArea.x + goalArea.width + 6,
      y: goalArea.y,
      width: greenW,
      height: goalArea.height
    };

    const leftGreenHit = this.lineIntersectsRect(startX, startY, endX, endY, leftGreenRect);
    const rightGreenHit = this.lineIntersectsRect(startX, startY, endX, endY, rightGreenRect);
    
    if (leftGreenHit || rightGreenHit) {
      return {
        collisionType: 'green_zone',
        finalTarget: { x: endX, y: endY },
        shouldSnap: false,
        hitPoint: leftGreenHit || rightGreenHit
      };
    }

    // Priority 3: Check yellow zone collision
    const yellowH = Math.max(8, goalArea.height * 0.12);
    const yellowWSide = Math.max(3, goalArea.width * 0.1);
    const yellowWSideSmall = Math.max(10, Math.round(yellowWSide * 0.5));
    const yellowShiftX = -5;
    
    const leftYellowRect = {
      x: goalArea.x + Math.max(1, goalArea.width * 0.03) - 30 + yellowShiftX,
      y: goalArea.y + Math.max(6, goalArea.height * 0.03),
      width: yellowWSideSmall,
      height: yellowH + 300
    };
    const rightYellowRect = {
      x: goalArea.x + goalArea.width - yellowWSideSmall - Math.max(6, goalArea.width * 0.03) + yellowShiftX,
      y: goalArea.y + Math.max(6, goalArea.height * 0.03),
      width: yellowWSideSmall,
      height: yellowH + 300
    };

    const leftYellowHit = this.lineIntersectsRect(startX, startY, endX, endY, leftYellowRect);
    const rightYellowHit = this.lineIntersectsRect(startX, startY, endX, endY, rightYellowRect);
    
    if (leftYellowHit || rightYellowHit) {
      return {
        collisionType: 'yellow_zone',
        finalTarget: { x: endX, y: endY },
        shouldSnap: true,
        hitPoint: leftYellowHit || rightYellowHit
      };
    }

    // Priority 4 & 5: Check outbound areas
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
  
  // Goal interaction zones are now handled inside the Goal class.
  // Zone setup, visuals and collision responses were moved to src/UI/goal.ts.

  private handleZoneCollisionFromGoal(zone: any) {
    // Handle zone collision - can trigger special effects, scoring, etc.
    console.log('Ball collided with zone:', zone);
    
    // If this zone represents a scoring area and we haven't scored yet
    if (!this._goalScored && zone) {
      // Trigger goal scoring callback if available
      if (this.goalScoredCallback) {
        this.goalScoredCallback(zone);
      }
      this._goalScored = true;
      console.log('Goal scored through zone collision!');
    }
  }

}
// ---- Goal zone helpers added below ----

// Note: helper functions are placed after class for readability but use closure to access class methods is not possible.
// We'll instead add methods back into the class by reopening it earlier. To keep changes minimal, append new methods inside class by re-opening file region.