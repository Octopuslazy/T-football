import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Ball extends PIXI.Container {
  // Basic display objects
  private ballSprite!: PIXI.Sprite;
  private shadowSprite!: PIXI.Graphics;
  private _placeholder: PIXI.Graphics | null = null;
  private _velocity = { x: 0, y: 0 };

  // Curve flight properties (kept for compatibility)
  private _curveStart: { x: number; y: number } | null = null;
  private _curveControl: { x: number; y: number } | null = null;
  private _curveEnd: { x: number; y: number } | null = null;
  private _moveStartTime = 0;
  private _moveDuration = 800;
  private _pathGraphics: PIXI.Graphics | null = null;
  private _previewGraphics: PIXI.Graphics | null = null;
  private _dragPath: Array<{ x: number; y: number }> = [];
  private _isMoving = false;
  private _pendingGoalZone: any = null;
  private _finalGoalCounted: boolean = false;
  private _pendingSave: boolean = false;
  private _pendingSaveZone: any = null;
  private _baseScale = 0.6;
  private _isDragging = false;
  private _dragTime = 0;
  private _inGoal = false;

  // Post-goal / animation state
  private _lastShotPower = 0;
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
  private _ballUsed = false;
  private _firstCollisionHandled = false;
  private _keeperCooldown = false;
  private _wasOut = false;
  private onEnterFrame!: () => void;
  private _onResize!: () => void;
  private _onPointerDown!: (e: any) => void;
  private _onPointerMove!: (e: any) => void;
  private _onPointerUp!: (e: any) => void;
  private _goalScored = false;
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
  public saveCallback?: () => void;
  public outCallback?: () => void;
  public gameState!: { ballsRemaining: number; gameOver: boolean };
  public goal: any;
  public goalkeeper: any;

  // 3D physics properties (depth/z, altitude, velocities, etc.)
  private _z: number = 0; // Depth (0 = kick position, increases toward goal)
  private _altitude: number = 0; // Height above ground
  private _vx: number = 0; // Horizontal velocity (screen X)
  private _vz: number = 0; // Depth velocity (toward goal)
  private _vy: number = 0; // Vertical velocity (altitude)
  private _curveFactor: number = 0; // Magnus/spin effect
  private _gravity: number = 0.8; // Simulated gravity
  private _friction: number = 0.99; // Air friction
  private _groundLevelY: number = 0; // Y position on screen at ball placement
  private _powerMultiplier: number = 2.5; // global shot power multiplier

  constructor(gameState?: { ballsRemaining: number; gameOver: boolean }, goal?: any, goalkeeper?: any) {
    super();
    // minimal constructor to avoid runtime crashes if not fully wired here
    if (gameState) this.gameState = gameState;
    this.goal = goal;
    this.goalkeeper = goalkeeper;
    // create visuals: white circle texture and shadow
    const baseRadius = 38;
    const diam = baseRadius * 2;
    const canvas = document.createElement('canvas');
    canvas.width = diam;
    canvas.height = diam;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(baseRadius, baseRadius, baseRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = PIXI.Texture.from(canvas as any);
    this.ballSprite = new PIXI.Sprite(tex);
    this.ballSprite.anchor.set(0.5, 0.5);
    this.shadowSprite = new PIXI.Graphics();
    this.addChild(this.shadowSprite);
    this.addChild(this.ballSprite);

    this.interactive = true;
    this.cursor = 'pointer';

    // preview graphics for drag path
    this._previewGraphics = new PIXI.Graphics();
    this.addChild(this._previewGraphics);

    // pointer handlers
    this._onPointerDown = (e: any) => {
      this._isDragging = true;
      this._dragPath = [];
      this._dragTime = performance.now();
      const p = e.data.global;
      this._startPos = { x: this.x, y: this.y };
      this._dragPath.push({ x: p.x, y: p.y });
      this._previewGraphics!.clear();
    };

    this._onPointerMove = (e: any) => {
      if (!this._isDragging) return;
      const p = e.data.global;
      const last = this._dragPath[this._dragPath.length - 1];
      // sample points to avoid overly dense arrays
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 6) {
        this._dragPath.push({ x: p.x, y: p.y });
      }
      // draw preview
      try {
        this._previewGraphics!.clear();
        this._previewGraphics!.lineStyle(4, 0xffffff, 0.9);
        for (let i = 0; i < this._dragPath.length - 1; i++) {
          const a = this._dragPath[i];
          const b = this._dragPath[i + 1];
          this._previewGraphics!.moveTo(a.x - this.x, a.y - this.y);
          this._previewGraphics!.lineTo(b.x - this.x, b.y - this.y);
        }
      } catch (e) {}
    };

    this._onPointerUp = (e: any) => {
      if (!this._isDragging) return;
      this._isDragging = false;
      const now = performance.now();
      const duration = Math.max(1, now - this._dragTime);
      const first = this._dragPath[0];
      const last = this._dragPath[this._dragPath.length - 1] || first;
      if (!first || !last) {
        this._previewGraphics!.clear();
        this._dragPath = [];
        return;
      }

      // compute swipe vector in screen space
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // power scaled by distance and shorter time = more power
      const speedFactor = Math.min(2.5, (dist / duration) * 20 + dist / 120);

      // map swipe to initial velocities (scaled up by power multiplier)
      this._vx = dx * 0.06 * speedFactor * this._powerMultiplier;
      this._vz = Math.max(8, (Math.abs(dy) * 0.06 + Math.abs(dx) * 0.03) * speedFactor * this._powerMultiplier + 8);
      this._vy = Math.max(10, Math.abs(dy) * 0.04 * speedFactor * this._powerMultiplier + 8);

      // curve / spin from path
      this._curveFactor = this.calculateCurveFactor({ x: first.x, y: first.y }, { x: last.x, y: last.y }, this._dragPath);

      // reset physics state and start movement
      this._z = 0;
      this._altitude = 0;
      this._isMoving = true;
      this._firstCollisionHandled = false;
      this._goalScored = false;
      this._moveStartTime = performance.now();

      // clear preview
      try { this._previewGraphics!.clear(); } catch (e) {}
      this._dragPath = [];
    };

    this.on('pointerdown', this._onPointerDown);
    this.on('pointermove', this._onPointerMove);
    this.on('pointerup', this._onPointerUp);
    this.on('pointerupoutside', this._onPointerUp);

    this.onEnterFrame = this.update.bind(this);
    PIXI.Ticker.shared.add(this.onEnterFrame);
    window.addEventListener('resize', () => this.updateScale());
    // initial sizing
    this.updateScale();
  }

  private updateScale() {
    if (!this.ballSprite || !this.ballSprite.texture) return;
    const targetWidth = BASE_WIDTH / 5;
    const s = targetWidth / this.ballSprite.texture.width;
    this._baseScale = s;
    this.ballSprite.scale.set(s, s);
    const groundLevel = (BASE_HEIGHT * 3) / 4;
    const goalY = this.goal?.goalSprite?.y || 0;
    const elevationOffset = 0.005 * goalY;
    this.x = Math.round(BASE_WIDTH / 2);
    this.y = groundLevel - elevationOffset;
    this._groundLevelY = this.y;
    this.updateShadow();
  }

  private updateShadow() {
    try {
      if (!this.shadowSprite) return;
      this.shadowSprite.clear();
      const yOff = this._currentYOffset || 0;
      const lift = Math.max(0, -yOff);
      const texWidth = (this.ballSprite && this.ballSprite.texture && this.ballSprite.texture.width) ? this.ballSprite.texture.width : 48;
      const baseRadius = (texWidth * this._baseScale) / 2 * 0.8;
      const shrinkFactor = 1 - Math.min(0.75, lift / Math.max(1, this._postGoalAmplitude * 1.2));
      const scaleFactor = (this.ballSprite && this._baseScale) ? (this.ballSprite.scale.x / this._baseScale) : 1;
      const shadowRadius = baseRadius * shrinkFactor * scaleFactor;
      const alpha = 0.35 * Math.max(0.25, shrinkFactor * scaleFactor);
      this.shadowSprite.fill(0x000000, alpha);
      const yPos = 10 + Math.max(0, lift * 0.2);
      this.shadowSprite.ellipse(0, yPos, shadowRadius, shadowRadius * 0.5);
      this.shadowSprite.fill();
    } catch (e) {}
  }

  private computeDeflectionVelocity(
    ballPos: { x: number; y: number },
    keeperPos: { x: number; y: number },
    power = 2
  ) {
    let dx = ballPos.x - keeperPos.x;
    let dy = ballPos.y - keeperPos.y;
    let len = Math.sqrt(dx * dx + dy * dy) || 1;
    let vx = dx / len;
    let vy = dy / len;
    try {
      const goalArea = this.goal?.getGoalArea && this.goal.getGoalArea();
      if (goalArea) {
        const gx = goalArea.x + goalArea.width / 2;
        const gy = goalArea.y + goalArea.height / 2;
        const toGoalX = gx - keeperPos.x;
        const toGoalY = gy - keeperPos.y;
        const dot = vx * toGoalX + vy * toGoalY;
        if (dot > 0) {
          let awayX = keeperPos.x - gx;
          let awayY = keeperPos.y - gy;
          const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
          vx = awayX / awayLen;
          vy = awayY / awayLen;
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
    this._vx = x;
    this._vy = y;
    this._isMoving = true;
    this.startBounceMovement();
  }

  private update() {
    // continue if moving or post-goal animation is running
    if (!this._isMoving && !this._postGoalAnimating) return;

    if (this._isMoving) {
        // --- 3D PHYSICS SIMULATION ---

        // 1. Magnus / curve effect on horizontal velocity
        this._vx += this._curveFactor * (this._vz / 20);

        // 2. Integrate positions
        this.x += this._vx; // horizontal
        this._z += this._vz; // depth
        this._altitude += this._vy; // altitude

        // 3. Gravity and friction
        this._vy -= this._gravity;
        this._vx *= this._friction;
        this._vz *= this._friction;

        // 4. Projection: map depth to screen Y (perspective)
        const perspectiveY = this._groundLevelY - (this._z * 0.6);
        this.y = perspectiveY - this._altitude;

        // 5. Scale by depth
        const depthScale = Math.max(0.4, 1 - (this._z / 2500));
        const finalScale = this._baseScale * depthScale;
        this.ballSprite.scale.set(finalScale, finalScale);

        // 6. Shadow (on ground)
        try {
          this.shadowSprite.position.set(0, 0);
          this.shadowSprite.clear();
          this.shadowSprite.fill(0x000000, 0.3 * (1 - Math.min(1, this._altitude / 200)));
          const shadowSize = (this.ballSprite.width / 2) * (1 - this._altitude / 400);
          this.shadowSprite.ellipse(0, this._altitude + 10, shadowSize, shadowSize * 0.5);
          this.shadowSprite.fill();
        } catch (e) {}

        // 7. Bounce on ground
        if (this._altitude <= 0) {
            this._altitude = 0;
            if (Math.abs(this._vy) > 2) {
                this._vy = -this._vy * 0.6;
                this._vx *= 0.8;
                this._vz *= 0.8;
            } else {
                this._vy = 0;
            }
        }

        // Collision checks when near or past goal depth
        const GOAL_DISTANCE = 800; // tune to match your scene
        if (this._z >= GOAL_DISTANCE && !this._firstCollisionHandled) {
            this.checkGoalCollision();
            this.checkGoalkeeperCollision();
            this._firstCollisionHandled = true;
        }

        // Stop conditions
        if (this._z > 1500 || (Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0)) {
            this._isMoving = false;
            if (!this._goalScored) this.handleGoalkeeperForMissedShots();
        }

        // Trigger goalkeeper timing prediction when depth reaches ~60%
        if (this._z > GOAL_DISTANCE * 0.6) {
            this.predictGoalkeeperTiming();
        }

    } else if (this._postGoalAnimating) {
        // Keep existing post-goal animation logic (unchanged)
        const now = performance.now();
        const p = Math.min(1, (now - this._postGoalStartTime) / this._postGoalDuration);
        const bounce = -Math.sin(p * Math.PI) * this._postGoalAmplitude * (1 - p * 0.6);
        let settleYOffset = 0;
        if (this._postGoalFinalY !== null && this._postGoalFinalY !== undefined) {
            const desiredFinalDelta = this._postGoalFinalY - this._animationBaseY;
            const settleProgress = Math.min(1, Math.max(0, (p - 0.4) / 0.6));
            settleYOffset = desiredFinalDelta * settleProgress;
        } else {
            settleYOffset = p > 0.9 ? (p - 0.9) / 0.1 * 12 : 0;
        }
        this._currentYOffset = bounce + settleYOffset;
        this.y = this._animationBaseY + this._currentYOffset;
        this.updateShadow();

        if (p >= 1) {
            this._postGoalAnimating = false;
            if (this._postGoalFinalY !== null && this._postGoalFinalY !== undefined) {
                this.y = this._postGoalFinalY;
                this._currentYOffset = this._postGoalFinalY - this._animationBaseY;
            } else {
                this.y = this._animationBaseY + 12;
                this._currentYOffset = 12;
            }
            this._postGoalFinalY = null;
            this.updateShadow();
            try {
                if (this._pendingGoalZone && !this._finalGoalCounted) {
                    if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                        try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch (e) {}
                        if (this.goalScoredCallback) this.goalScoredCallback(this._pendingGoalZone);
                        this._finalGoalCounted = true;
                    }
                    this._pendingGoalZone = null;
                }
            } catch (e) {}
            try {
                if (this._pendingSave) {
                    if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                        if (!this._finalGoalCounted) {
                            const zone = this.goal.getZoneFromPosition(this.x, this.y) || this._pendingSaveZone;
                            try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch (e) {}
                            if (zone && this.goalScoredCallback) this.goalScoredCallback(zone);
                            this._finalGoalCounted = true;
                        }
                    } else {
                        if (this.saveCallback) this.saveCallback();
                    }
                    this._pendingSave = false;
                    this._pendingSaveZone = null;
                }
            } catch (e) {}
            try {
                if (this._wasOut && this.outCallback) {
                    try { this.outCallback(); } catch (e) {}
                }
            } catch (e) {}
            try {
                if (this.onBallDestroyed) {
                    setTimeout(() => { try { if (this.onBallDestroyed) this.onBallDestroyed(); } catch (e) {} }, 800);
                }
            } catch (e) {}
        }
    }

    // Ensure shadow updated each frame
    this.updateShadow();
  }

  // Compute control point from recorded drag path: take point with max perpendicular distance
  private computeControlFromPath(start: { x: number; y: number }, end: { x: number; y: number }, path: Array<{ x: number; y: number }>) {
    if (!path || path.length === 0) return null as any;
    // line vector
    const lx = end.x - start.x;
    const ly = end.y - start.y;
    const l2 = lx * lx + ly * ly || 1;
    let sumSigned = 0;
    let count = 0;
    let maxAbs = 0;
    for (const p of path) {
      // cross product to compute signed perpendicular distance: cross = (p-start) x (end-start)
      const cross = (p.x - start.x) * ly - (p.y - start.y) * lx;
      const signedDist = cross / Math.sqrt(l2);
      sumSigned += signedDist;
      count++;
      if (Math.abs(signedDist) > maxAbs) maxAbs = Math.abs(signedDist);
    }
    const avgSigned = count > 0 ? (sumSigned / count) : 0;
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    // If the path deviates very little, return midpoint
    if (Math.abs(avgSigned) < 6 && maxAbs < 6) return { x: mid.x, y: mid.y };
    // build perpendicular unit vector
    const len = Math.sqrt(l2) || 1;
    const perpUnit = { x: -ly / len, y: lx / len };
    // control point is midpoint shifted along perp by avgSigned (weighted) and towards midpoint
    const weight = 0.85; // how strongly to follow path vs midpoint
    const shift = avgSigned * weight;
    return { x: mid.x + perpUnit.x * shift, y: mid.y + perpUnit.y * shift };
  }
  
  // Calculate curve factor (spin) from recorded drag path
  private calculateCurveFactor(start: {x: number, y: number}, end: {x: number, y: number}, path: Array<{x:number,y:number}>) {
    if (!path || path.length < 5) return 0;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    let maxDist = 0;
    for (const p of path) {
      const dist = (p.x - start.x) * nx + (p.y - start.y) * ny;
      if (Math.abs(dist) > Math.abs(maxDist)) maxDist = dist;
    }
    const MAX_CURVE = 1.5;
    return Math.max(-MAX_CURVE, Math.min(MAX_CURVE, maxDist * 0.02));
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

    // (low_power case intentionally removed - weak swipes now still produce a full flight)

    // Priority 8: Normal behavior (snapping disabled)
    return {
      collisionType: 'normal',
      finalTarget: { x: endX, y: endY },
      shouldSnap: false,
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
    if (!this.goalkeeper || !this._isMoving || this._goalScored || this._ballUsed || this._keeperCooldown) {
      return;
    }

    const goalArea = this.goal?.getGoalArea();
    if (!goalArea) return;

    // Estimate when ball will reach goal depth and predict landing point
    const GOAL_DISTANCE = 800; // tune as needed
    if (this._vz <= 0) return;
    const timeToGoal = Math.max(0.001, (GOAL_DISTANCE - this._z) / this._vz);
    // Predict future position (simple kinematic estimate)
    const predictedX = this.x + this._vx * timeToGoal;
    const predictedY = this.y + (this._vy * timeToGoal) - 0.5 * this._gravity * timeToGoal * timeToGoal;

    const predictedZone = this.goal.getZoneFromPosition(predictedX, predictedY) || { id: Math.floor(Math.random() * 12) + 1 };

    // Only trigger goalkeeper when ball is close in depth (e.g., ~60-90%)
    const progressZ = this._z / GOAL_DISTANCE;
    if (progressZ > 0.6 && progressZ < 0.95) {
      this._goalScored = true; // Prevent duplicate triggers
      const ballRadius = this.ballSprite.width / 2;
      const ballPosAtCall = { x: predictedX, y: predictedY };
      this.goalkeeper.attemptCatch(predictedX, predictedY, predictedZone, ballRadius).then((result: any) => {
        if (result.caught) {
          const catchPos = result.catchPos || ballPosAtCall;
          // Check goalkeeper catch probability - if 100%, skip proximity validation entirely
          let skipProximityCheck = false;
          try {
            const keeperProb = this.goalkeeper && (this.goalkeeper as any).getCatchProbability ? (this.goalkeeper as any).getCatchProbability() : 0;
            skipProximityCheck = keeperProb >= 1.0;
          } catch (e) {}
          
          if (!skipProximityCheck) {
            // Verify proximity using position at call time, not current moving position
            try {
              const dx = ballPosAtCall.x - (catchPos.x || 0);
              const dy = ballPosAtCall.y - (catchPos.y || 0);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const keeperRadius = (this.goalkeeper && (this.goalkeeper as any).getCollisionRadius) ? (this.goalkeeper as any).getCollisionRadius() : 40;
              const ballRadiusNow = ballRadius || (this.ballSprite.width / 2) || 20;
              // Make validation MUCH more lenient - 5x more tolerance
              const maxCatchDist = Math.max(200, (keeperRadius + ballRadiusNow) * 5);
              if (dist > maxCatchDist) {
                console.log('Keeper reported catch but catchPos too far — treating as miss', {dist, maxCatchDist, ballPosAtCall, catchPos});
                this._goalScored = false;
                return;
              }
            } catch (e) {}
          } else {
            console.log('100% catch probability - skipping proximity validation');
          }
          console.log(`🥅 Perfect timing! Goalkeeper saved in zone ${result.catchZone.id}!`);
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
                    // spawn visual impact effect at final resting point
                    try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch (e) {}
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
                      // spawn impact effect for converted goal
                      try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch (e) {}
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
        
      }
      
      // Only score once and trigger goalkeeper at the right moment
      if (!this._goalScored) {
        const zone = this.goal.getZoneFromPosition(ballPosition.x, ballPosition.y);
        
        // Goalkeeper attempts when ball actually enters goal area (not before)
        if (this.goalkeeper && zone) {
          
          this._goalScored = true; // Mark as processed to prevent duplicate calls
          
          const ballRadius = this.ballSprite.width / 2;
          const ballPosAtCall = { x: ballPosition.x, y: ballPosition.y }; // Store position at call time
          this.goalkeeper.attemptCatch(ballPosition.x, ballPosition.y, zone, ballRadius).then((result: any) => {
              if (result.caught) {
                const catchPos = result.catchPos || ballPosAtCall;
                // Check goalkeeper catch probability - if 100%, skip proximity validation
                let skipProximityCheck = false;
                try {
                  const keeperProb = this.goalkeeper && (this.goalkeeper as any).getCatchProbability ? (this.goalkeeper as any).getCatchProbability() : 0;
                  skipProximityCheck = keeperProb >= 1.0;
                } catch (e) {}
                
                if (!skipProximityCheck) {
                  try {
                    const dx = ballPosAtCall.x - (catchPos.x || 0);
                    const dy = ballPosAtCall.y - (catchPos.y || 0);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const keeperRadius = (this.goalkeeper && (this.goalkeeper as any).getCollisionRadius) ? (this.goalkeeper as any).getCollisionRadius() : 40;
                    const ballRadiusNow = ballRadius || (this.ballSprite.width / 2) || 20;
                    const maxCatchDist = Math.max(200, (keeperRadius + ballRadiusNow) * 5);
                    if (dist > maxCatchDist) {
                     
                      this._goalScored = false;
                      return;
                    }
                  } catch (e) {}
                } else {
                  
                }
                console.log(`🥅 Goalkeeper saved! Deflecting ball from zone ${result.catchZone.id}!`);
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
    try {
      this.off('pointerdown', this._onPointerDown);
      this.off('pointermove', this._onPointerMove);
      this.off('pointerup', this._onPointerUp);
      this.off('pointerupoutside', this._onPointerUp);
    } catch (e) {}
    
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
          const ballPosAtCall = { x: this.x, y: this.y }; // Store current position at call time
          this.goalkeeper.attemptCatch(this.x, this.y, null, ballRadius).then((result: any) => {
            if (result.caught) {
                const catchPos = result.catchPos || ballPosAtCall;
                // Check goalkeeper catch probability - if 100%, skip proximity validation
                let skipProximityCheck = false;
                try {
                  const keeperProb = this.goalkeeper && (this.goalkeeper as any).getCatchProbability ? (this.goalkeeper as any).getCatchProbability() : 0;
                  skipProximityCheck = keeperProb >= 1.0;
                } catch (e) {}
                
                if (!skipProximityCheck) {
                  try {
                    const dx = ballPosAtCall.x - (catchPos.x || 0);
                    const dy = ballPosAtCall.y - (catchPos.y || 0);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const keeperRadius = (this.goalkeeper && (this.goalkeeper as any).getCollisionRadius) ? (this.goalkeeper as any).getCollisionRadius() : 40;
                    const ballRadiusNow = ballRadius || (this.ballSprite.width / 2) || 20;
                    const maxCatchDist = Math.max(200, (keeperRadius + ballRadiusNow) * 5);
                    if (dist > maxCatchDist) {
                     
                      return;
                    }
                  } catch (e) {}
                } else {
                 
                }
                
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
    
    
    // If this zone represents a scoring area and we haven't scored yet
    if (!this._goalScored && zone) {
      // Defer final scoring until ball settles — mark pending zone
      this._pendingGoalZone = zone;
      this._finalGoalCounted = false;
      this._goalScored = true;
      
    }
  }

}
// ---- Goal zone helpers added below ----

// Note: helper functions are placed after class for readability but use closure to access class methods is not possible.
// We'll instead add methods back into the class by reopening it earlier. To keep changes minimal, append new methods inside class by re-opening file region.