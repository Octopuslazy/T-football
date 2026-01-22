import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Ball extends PIXI.Container {
  // --- Visuals ---
  private ballSprite!: PIXI.Sprite;
  private shadowSprite!: PIXI.Graphics;
  private _previewGraphics: PIXI.Graphics | null = null;

  // --- Physics & State ---
  private _velocity = { x: 0, y: 0 }; // 2D placeholder (cho tương thích cũ)
  
  // 3D Physics Properties
  private _z: number = 0;           // Độ sâu (0 = điểm đặt bóng)
  private _altitude: number = 0;    // Độ cao so với mặt đất (Y ngược)
  private _vx: number = 0;          // Vận tốc ngang
  private _vy: number = 0;          // Vận tốc dọc (Altitude velocity)
  private _vz: number = 0;          // Vận tốc chiều sâu (Depth velocity)
  private _curveFactor: number = 0; // Lực xoáy (Magnus effect)
  
  // Constants
  private readonly GOAL_DISTANCE = 600; // Khoảng cách từ điểm sút đến khung thành
  private readonly GRAVITY = 1.1;
  private readonly FRICTION = 0.99;
  private readonly GROUND_Y_OFFSET = 100; // Điều chỉnh mặt đất

  // Flags
  private _isMoving = false;
  private _isDragging = false;
  private _dragPath: Array<{ x: number; y: number }> = [];
  private _dragTime = 0;
  private _goalScored = false;      // Đã xác nhận bàn thắng chưa
  private _ballUsed = false;        // Bóng đã vào lưới hoặc ra ngoài chưa
    private _pushedOffByPost = false; // ball was forcefully pushed off by post/crossbar
    private _potentialGoal = false;   // Candidate goal detected during flight
    private _targetZ: number | null = null; // Smoothly move _z toward this target when set
    private _keeperCooldown = false;  // Cooldown sau khi thủ môn chạm bóng
    private _allowGoalAttract = true; // Per-shot flag: disable attraction for mostly-horizontal swipes
    private _displayScale: number | null = null; // Smoothed visual scale to avoid snapping
    private _forceScaleFrames: number = 0; // skip lerp for a few frames after forced scale
    private _lastPostCollisionTime: number = 0;
    private _ignorePostCollisions: boolean = false; // temporarily disable post collisions (e.g., on keeper save)
    private _ignoreGoalkeeper: boolean = false; // when true, skip goalkeeper interactions for this shot

  // External Refs
  public goal: any;
  public goalkeeper: any;
  public gameState: any;
  
  // Callbacks
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
  public saveCallback?: () => void;
  public outCallback?: () => void;

  private onEnterFrame!: () => void;
    private _baseScale = 0.6;
    private _groundLevelY = 0;
        private _powerMultiplier = 1.6; // further reduced shot power
        // Velocity caps to avoid extremely large forces from long/fast swipes
        private readonly MAX_VX = 30;
        private readonly MAX_VY = 20;
        private readonly MAX_VZ = 40;
        // Minimum velocity floors so weak swipes still reach the net
        private readonly MIN_VX = 12;
        private readonly MIN_VY = 10;
        private readonly MIN_VZ = 20;
        // Gentle lateral attraction toward goal center (small, non-snapping)
        // Increased so the tendency to curve into the net is visible but subtle
        private readonly GOAL_ATTRACT = 0.004;

  constructor(gameState?: { ballsRemaining: number; gameOver: boolean }, goal?: any, goalkeeper?: any) {
    super();
    if (gameState) this.gameState = gameState;
    this.goal = goal;
    this.goalkeeper = goalkeeper;

    this.createVisuals();

    this.interactive = true;
    this.cursor = 'pointer';

    this.on('pointerdown', this._onPointerDown);
    this.on('pointermove', this._onPointerMove);
    this.on('pointerup', this._onPointerUp);
    this.on('pointerupoutside', this._onPointerUp);

        // Register global pointer handlers so swipes starting anywhere are accepted
        this._globalPointerDown = (ev: PointerEvent) => {
            try {
                // ignore if already dragging on this ball or ball used
                if (this._isMoving || this._ballUsed) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerDown({ data: p });
            } catch (e) { console.warn('ball.ts global down', e); }
        };
        this._globalPointerMove = (ev: PointerEvent) => {
            try {
                if (!this._isDragging) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerMove({ data: p });
            } catch (e) { console.warn('ball.ts global move', e); }
        };
        this._globalPointerUp = (ev: PointerEvent) => {
            try {
                if (!this._isDragging) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerUp({ data: p });
            } catch (e) { console.warn('ball.ts global up', e); }
        };
        window.addEventListener('pointerdown', this._globalPointerDown);
        window.addEventListener('pointermove', this._globalPointerMove);
        window.addEventListener('pointerup', this._globalPointerUp);

    this.onEnterFrame = this.update.bind(this);
    PIXI.Ticker.shared.add(this.onEnterFrame);
    
    // Initial sizing
    this.updateScale();
    window.addEventListener('resize', () => this.updateScale());
  }

  private createVisuals() {
    const baseRadius = 38;
    const canvas = document.createElement('canvas');
    canvas.width = baseRadius * 2;
    canvas.height = baseRadius * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(baseRadius, baseRadius, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      // Simple texture pattern
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(baseRadius + 15, baseRadius - 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(baseRadius - 15, baseRadius + 15, 6, 0, Math.PI * 2); ctx.fill();
    }
    const tex = PIXI.Texture.from(canvas as any);
    
    this.shadowSprite = new PIXI.Graphics();
    this.addChild(this.shadowSprite);

    this.ballSprite = new PIXI.Sprite(tex);
    this.ballSprite.anchor.set(0.5);
    this.addChild(this.ballSprite);

        // Expand interactive hit area so small off-center taps still register as pointerdown
        try {
            const hitR = 60; // pixels radius for easier touching
            this.hitArea = new PIXI.Circle(0, 0, hitR);
            this.interactive = true; // ensure container is interactive
        } catch (e) {
            console.warn('ball.ts: failed to set hitArea', e);
        }

    this._previewGraphics = new PIXI.Graphics();
    this.addChild(this._previewGraphics);
  }

  private updateScale() {
    if (!this.ballSprite || !this.ballSprite.texture) return;
    const targetWidth = BASE_WIDTH / 6;
    const s = targetWidth / this.ballSprite.texture.width;
    this._baseScale = s;
    this.ballSprite.scale.set(s, s);
    
    const groundLevel = (BASE_HEIGHT * 3) / 4;
    this.x = Math.round(BASE_WIDTH / 2);
    this.y = groundLevel;
    this._groundLevelY = this.y;
    
    this.updateShadow(this._groundLevelY, this._baseScale);
  }

    // Public helper: set the ball's base scale (affects final scale and shadow)
    public setScale(factor: number) {
        if (!factor || factor <= 0) return;
        this._baseScale = factor;
        if (this.ballSprite && this.ballSprite.texture) {
            this.ballSprite.scale.set(this._baseScale, this._baseScale);
        }
        // Update shadow with current ground level
        this.updateShadow(this._groundLevelY || (BASE_HEIGHT * 3) / 4, this._baseScale);
    }

  // --- INPUT HANDLING ---

  private _onPointerDown = (e: any) => {
    if (this._isMoving || this._ballUsed) return;
    this._isDragging = true;
    this._dragPath = [];
    this._dragTime = performance.now();
    const p = e.data.global;
    this._dragPath.push({ x: p.x, y: p.y });
    this._previewGraphics?.clear();
        // default: allow attraction until we determine swipe direction
        this._allowGoalAttract = true;
  };

  private _onPointerMove = (e: any) => {
    if (!this._isDragging) return;
    const p = e.data.global;
    this._dragPath.push({ x: p.x, y: p.y });

    // Draw trail
    if (this._previewGraphics) {
        this._previewGraphics.clear();
        this._previewGraphics.lineStyle(4, 0xffff00, 0.8);
        const localStart = this.toLocal(new PIXI.Point(this._dragPath[0].x, this._dragPath[0].y));
        this._previewGraphics.moveTo(localStart.x, localStart.y);
        
        for (let i = 1; i < this._dragPath.length; i += 2) {
            const localP = this.toLocal(new PIXI.Point(this._dragPath[i].x, this._dragPath[i].y));
            this._previewGraphics.lineTo(localP.x, localP.y);
        }
    }
  };

  private _onPointerUp = (e: any) => {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._previewGraphics?.clear();

    const now = performance.now();
    const duration = Math.max(1, now - this._dragTime);
    
    if (this._dragPath.length < 2) return;

    const first = this._dragPath[0];
    const last = this._dragPath[this._dragPath.length - 1];


    // Use global swipe vector (world coords) so swipes anywhere map to shot direction
    const dx = last.x - first.x;
    // Upward motion should increase depth/lift, so invert Y (start.y - end.y)
    const dy = first.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Filter weak swipes (allow shorter swipes)
    if (dist < 20) return;

    // Calculate Power (cap speedFactor to avoid extreme values)
    const speedFactor = Math.min(1.3, (dist / duration) * 0.02 + dist / 120);

    // Set 3D Velocities (tuned for much gentler shots)
    const computedVx = dx * 0.02 * speedFactor * this._powerMultiplier; // horizontal scaled from swipe
    const computedVy = Math.max(0, dy) * 0.025 * speedFactor * this._powerMultiplier; // Altitude lift (only positive when swiping up)
    const computedVz = Math.max(6, dy * 0.035 * speedFactor * this._powerMultiplier); // depth velocity driven by upward swipe

        // Enforce minimum floors so weak swipes still travel sufficiently
        // Introduce a small deadzone for horizontal input so tiny jitters don't force lateral movement.
        const HORIZONTAL_DEADZONE = 10; // pixels of raw swipe dx below which we treat as straight
        if (Math.abs(dx) < HORIZONTAL_DEADZONE) {
            this._vx = 0.5; // small nudge to avoid zero
        } else {
            this._vx = Math.sign(computedVx) * Math.max(this.MIN_VX, Math.abs(computedVx));
        }
    this._vy = Math.max(this.MIN_VY, computedVy);
    this._vz = Math.max(this.MIN_VZ, computedVz);

    // Clamp velocities to configured maximums to prevent extremely large forces
    this._vx = Math.max(-this.MAX_VX, Math.min(this.MAX_VX, this._vx));
    this._vy = Math.max(0, Math.min(this.MAX_VY, this._vy));
    this._vz = Math.max(this.MIN_VZ, Math.min(this.MAX_VZ, this._vz));

    // Calculate Spin (Magnus)
    this._curveFactor = this.calculateCurveFactor(first, last, this._dragPath);

    // Decide whether to allow goal attraction for this shot: disable for mostly-horizontal swipes
    // If horizontal displacement is significantly larger than vertical (lift) component, treat as horizontal swipe
    this._allowGoalAttract = !(Math.abs(dx) > Math.abs(dy) * 1.5);

    // Reset State
    this._z = 0;
    this._altitude = 0;
    this._isMoving = true;
    // Ensure we allow goalkeeper checks for the new shot by default
    this._ignoreGoalkeeper = false;
    this._ballUsed = false;
    this._goalScored = false;
  };

    // Global pointer handlers so user can swipe anywhere on screen
    private _globalPointerDown!: (e: PointerEvent) => void;
    private _globalPointerMove!: (e: PointerEvent) => void;
    private _globalPointerUp!: (e: PointerEvent) => void;

  private calculateCurveFactor(start: {x:number, y:number}, end: {x:number, y:number}, path: any[]) {
     // Find point with max deviation from straight line
     let maxDist = 0;
     const dx = end.x - start.x;
     const dy = end.y - start.y;
     const len = Math.sqrt(dx*dx + dy*dy) || 1;
     
     // Normal vector
     const nx = -dy / len;
     const ny = dx / len;

     for (const p of path) {
         // Project point onto normal vector
         const dist = (p.x - start.x) * nx + (p.y - start.y) * ny;
         if (Math.abs(dist) > Math.abs(maxDist)) maxDist = dist;
     }

      // Tuning: reduce raw spin sensitivity and clamp to a smaller range
      return Math.max(-1, Math.min(1, maxDist * 0.01)); 
  }

  // --- MAIN LOOP ---

  private update() {
    if (!this._isMoving) return;

    // 1. Physics Integration
    // Magnus effect (strongly damped to avoid excessive curving)
    this._vx += this._curveFactor * (this._vz / 120);

    // Gentle attraction toward the goal center: only apply when the ball
    // is approaching the goal (near goal depth) so early flight is unaffected.
    const approachStart = this.GOAL_DISTANCE * 0.5; // start applying at 50% of distance
    const approachEnd = this.GOAL_DISTANCE + 200;   // small margin past goal plane
    if (this._allowGoalAttract && this.goal && this.goal.goalSprite && this._vz > 0 && this._z >= approachStart && this._z <= approachEnd) {
        try {
            const nb = this.goal.goalSprite.getBounds();
            const worldCenterX = nb.x + nb.width / 2;
            const converter = this.parent || this;
            const localCenter = converter.toLocal(new PIXI.Point(worldCenterX, nb.y + nb.height));
            const dxToGoal = localCenter.x - this.x;
            const tDepth = Math.min(1, this._z / this.GOAL_DISTANCE);
            const attractStrength = this.GOAL_ATTRACT * (0.2 + 0.8 * tDepth); // baseline + increases with depth
            this._vx += dxToGoal * attractStrength;
        } catch (e) {
            console.warn('ball.ts: goal attraction failed', e);
        }
    }
    
    // Apply Gravity & Friction
    this._vy -= this.GRAVITY;
    this._vx *= this.FRICTION;
    this._vz *= this.FRICTION;

    // Move positions
    this.x += this._vx;
    // If a target Z is set (e.g. we want the ball to settle into the net),
    // smoothly interpolate _z toward it to avoid snapping the visual scale.
    if (this._targetZ !== null) {
        const dz = this._targetZ - this._z;
        // move up to a small step per frame (smooth)
        const step = Math.sign(dz) * Math.min(Math.abs(dz), Math.max(2, Math.abs(this._vz) * 0.5));
        this._z += step;
        // damp depth velocity while settling
        this._vz *= 0.8;
        if (Math.abs(dz) < 0.5) {
            this._z = this._targetZ;
            this._targetZ = null;
        }
    } else {
        this._z += this._vz;
    }
    this._altitude += this._vy;

    // 2. Perspective Projection (2.5D)
    // As Z increases, the "ground" position on screen moves up (vanishing point)
    // We assume the goal is at Z = 800
    const tDepth = this._z / this.GOAL_DISTANCE;
    
    // Get Goal's bottom Y for perspective target
    let targetGroundY = this._groundLevelY - 200; // Default fallback
        if (this.goal && this.goal.goalSprite) {
            // Prefer exact net bottom in world coords and convert to ball-local.
            // This avoids incorrect results when goal and ball live in different containers.
            try {
                const nb = this.goal.goalSprite.getBounds();
                const worldBottomY = 0.7*nb.y + nb.height;
                const worldCenterX = nb.x + nb.width / 2;
                // Convert world point into the coordinate space of the ball's parent (or ball)
                const converter = this.parent || this;
                const localPt = converter.toLocal(new PIXI.Point(worldCenterX, worldBottomY));
                targetGroundY = localPt.y;
            } catch (e) {
                console.warn('ball.ts: failed to compute net bottom local Y', e);
            }
        }
    
    // Interpolate current visual ground Y
    const currentGroundVisualY = this._groundLevelY + (targetGroundY - this._groundLevelY) * Math.min(1, tDepth);
    
    // Final Screen Y = Ground - Altitude
    this.y = currentGroundVisualY - this._altitude;

    // Scale Logic: strictly derive visual scale from screen Y so
    // when `y` increases scale decreases, and when `y` decreases scale increases.
    // This mapping is independent of internal Z/altitude values to satisfy the rule.
    const yNorm = Math.max(0, Math.min(1, this.y / BASE_HEIGHT)); // 0 = top, 1 = bottom
    const minFactor = 0.35; // scale factor when y is at bottom
    const maxFactor = 1.0;  // scale factor when y is at top
    const visualFactor = maxFactor - (maxFactor - minFactor) * yNorm;
    const finalScale = this._baseScale * visualFactor;
        // Smooth the displayed scale to avoid snapping when bouncing off crossbar/net
        if (this._displayScale === null) this._displayScale = finalScale;
        if (this._forceScaleFrames && this._forceScaleFrames > 0) {
            // Honor the forced display scale for a couple frames to avoid immediate override
            this._forceScaleFrames -= 1;
            this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
        } else {
            // Lerp toward target scale (0.18 gives a responsive but smooth transition)
            this._displayScale += (finalScale - this._displayScale) * 0.18;
            this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
        }

    // Visual Rotation
    this.ballSprite.rotation += this._vx * 0.05;

    // 3. Shadow Update
    this.updateShadow(currentGroundVisualY, finalScale);

    // 4. Ground Collision (Bounce)
    if (this._altitude <= 0) {
        this._altitude = 0;
        if (Math.abs(this._vy) > 2) {
            this._vy = -this._vy * 0.5; // Bounce energy loss
            this._vx *= 0.8;
            this._vz *= 0.8;
        } else {
            this._vy = 0;
            // Roll friction
            this._vx *= 0.9; 
            this._vz *= 0.9;
        }
    }

    // 5. Game Logic Checks (Collisions)
    // When near the goal depth always check posts/crossbar collisions so
    // the ball can interact with left/right posts even while in the net.
    if (this._z >= this.GOAL_DISTANCE) {
        // Priority: posts/crossbar (checked always near goal depth)
        if (this.checkPostCollisions()) return;
        // If the ball has not been used (not yet scored/out), perform goal checks
        if (!this._ballUsed) {
            this.checkGameCollisions();
        }
    }

    // Goalkeeper AI Trigger (slightly before goal)
    if (this.goalkeeper && this._z > this.GOAL_DISTANCE * 0.65 && this._vz > 0 && !this._ballUsed && !this._keeperCooldown && !this._ignoreGoalkeeper) {
        this.triggerGoalkeeper();
    }

    // Stop conditions
    if (this._z > 1500 || (Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0)) {
        this.finishTurn();
    }
  }

  private updateShadow(groundY: number, scale: number) {
      if (!this.shadowSprite) return;
      this.shadowSprite.clear();
      const shadowAlpha = 0.3 * Math.max(0, 1 - (this._altitude / 300));
      const shadowScale = scale * Math.max(0.5, 1 - (this._altitude / 200));
      
      this.shadowSprite.beginFill(0x000000, shadowAlpha);
      this.shadowSprite.drawEllipse(0, 0, 20 * shadowScale, 10 * shadowScale);
      this.shadowSprite.endFill();
      this.shadowSprite.position.set(0, this._altitude + 15 * scale); // Relative to Container (Ball is 0,0)
  }

  // --- COLLISION LOGIC ---

  private checkGameCollisions() {
      // Priority 1: Check Posts/Crossbar
      if (this.checkPostCollisions()) return;

      // Priority 2: Check Goal (Net)
      // FIX: Added altitude check!
      // Assuming goal height is around 120px-150px in world space (relative to goal sprite)
      const MAX_GOAL_HEIGHT = 140; 
      
      if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
          if (this._altitude < MAX_GOAL_HEIGHT) {
              // Candidate goal: defer final decision until ball stops
              this._potentialGoal = true;
          } else {
              // OVER THE BAR
              console.log("Over the bar!");
              // Ball continues flying...
          }
      }
  }

  private checkPostCollisions(): boolean {
      if (this._ignorePostCollisions) return false;
      if (!this.goal) return false;
      const r = (this.ballSprite.width / 2) * 0.8; // Reduced hitbox for realism

      // Helper for collision
      const checkHit = (obj: any) => {
          if (!obj) return false;
          const bounds = obj.getBounds();
          // Simple circle-rect check in screen space
          const dx = Math.abs(this.x - (bounds.x + bounds.width/2));
          const dy = Math.abs(this.y - (bounds.y + bounds.height/2));

          if (dx > (bounds.width/2 + r)) return false;
          if (dy > (bounds.height/2 + r)) return false;
          return true;
      };

      // Check Left, Right, Crossbar
      const hitLeft = checkHit(this.goal.leftPost);
      const hitRight = checkHit(this.goal.rightPost);
      const hitCross = checkHit(this.goal.crossbar);

      // If the ball hit the crossbar but is inside the goal area (i.e. landed into the net),
      // treat it as a goal instead of deflecting the ball out of the net.
      if (hitCross) {
          try {
              // Predict a short future step to decide whether the ball will go into the net
              // or bounce back. This avoids treating all crossbar touches as goals.
              const dt = 0.12; // small time step (seconds)
              // simple kinematic prediction (screen-space):
              const predX = this.x + this._vx * dt;

              // Predict altitude after dt using current _vy and GRAVITY
              const predAltitude = this._altitude + this._vy * dt - 0.5 * (this.GRAVITY) * dt * dt;

              // Predict z (depth)
              const predZ = this._z + this._vz * dt;

              // Compute projected ground Y at predicted depth (reuse perspective formula)
              const predT = Math.min(1, predZ / this.GOAL_DISTANCE);
              let predTargetGroundY = this._groundLevelY - 200;
              if (this.goal && this.goal.goalSprite) {
                  try {
                      const nb = this.goal.goalSprite.getBounds();
                      const worldBottomY = nb.y + nb.height;
                      const worldCenterX = nb.x + nb.width / 2;
                      const converter = this.parent || this;
                      const localPt = converter.toLocal(new PIXI.Point(worldCenterX, worldBottomY));
                      predTargetGroundY = localPt.y;
                  } catch (e) {
                      // fallback left as is
                  }
              }
              const predGroundY = this._groundLevelY + (predTargetGroundY - this._groundLevelY) * predT;
              const predScreenY = predGroundY - Math.max(0, predAltitude);

              if (this.goal && this.goal.isInGoalArea(predX, predScreenY) && predAltitude < 140) {
                  // Predicted to land in goal -> mark potential goal and defer final check
                  this._potentialGoal = true;
                  return true;
              }
          } catch (e) {
              console.warn('ball.ts: predictive crossbar check failed', e);
          }
      }

      const now = Date.now();

      // Helper to process a post-like collision with approach check and penetration correction
      const handlePost = (obj: any) => {
          if (!obj) return false;
          try {
              const bounds = obj.getBounds();
              const postCenterX = bounds.x + bounds.width / 2;
              const dxToPost = postCenterX - this.x;
              const approaching = dxToPost * this._vx > 0; // positive if moving toward post
              const recent = (now - this._lastPostCollisionTime) < 200;
              if (!approaching && recent) return false;

                            // push ball out of penetration horizontally
                            const sign = Math.sign(this.x - postCenterX) || 1;

                            // Decide if the ball is inside the net (goal) — if so, nudge inward lightly
                            let inNet = false;
                            try {
                                const converter = this.parent || this;
                                const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                                const goalLocal = this.goal.toLocal(worldPt);
                                inNet = !!(this.goal && this.goal.isInGoalArea(goalLocal.x, goalLocal.y));
                            } catch (e) {
                                inNet = false;
                            }

                            if (inNet && (obj === this.goal.leftPost || obj === this.goal.rightPost)) {
                                // Nudge slightly toward goal center so ball doesn't rest on the post
                                const inwardSign = obj === this.goal.leftPost ? 1 : -1; // left post -> nudge right (into net)
                                const inwardX = postCenterX + inwardSign * (bounds.width / 2 + r + 6);
                                this.x = inwardX;
                                spawnImpactEffect(this.parent || this, this.x, this.y);
                                // gentle, proportional nudge toward center (smaller than full rebound)
                                const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                                const nudge = Math.max(4, Math.min(28, incoming * 0.35));
                                this._vx = inwardSign * nudge;
                                this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
                                this._vy = Math.max(2, Math.abs(this._vy) * 0.3 + nudge * 0.08);
                                // do not mark as pushed-off; keep collisions enabled so it can still interact
                                this._lastPostCollisionTime = now;
                                return true;
                            }

                            // push far enough so ball isn't left resting on the post edge
                            const outX = postCenterX + sign * (bounds.width / 2 + r + 12);
                            this.x = outX;

                            spawnImpactEffect(this.parent || this, this.x, this.y);
                            // Compute impulse proportional to incoming motion so rebound feels physical
                            const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                            const impact = Math.max(12, Math.min(90, incoming * 1.15));
                            this._altitude = Math.max(this._altitude, 60);
                            // Reflect depth using impact magnitude (send away from goal)
                            this._vz = -Math.sign(this._vz || 1) * impact * 0.9;
                            // Horizontal push scaled from impact and directed away from post center
                            const sidePush = Math.sign(this.x - postCenterX) || Math.sign(this._vx) || 1;
                            this._vx = sidePush * impact * 0.8;
                            // Give vertical pop proportional to impact and existing vertical energy
                            this._vy = Math.max(6, Math.abs(this._vy) * 0.5 + impact * 0.18);
                            // Mark as pushed off by post so finishTurn treats it as an 'out'
                            this._pushedOffByPost = true;
                            this._ignorePostCollisions = true;
                            this._lastPostCollisionTime = now;
                            return true;
          } catch (e) {
              console.warn('ball.ts: post collision handling failed', e);
              return false;
          }
      };

      // Crossbar handling: ensure we're moving downward toward the crossbar (falling)
      if (hitCross) {
          try {
              const bounds = this.goal.crossbar.getBounds();
              const centerY = bounds.y + bounds.height / 2;
              // If altitude is falling (vy < 0) or z is approaching, handle collision
              const falling = this._vy < 0 || this._vz > 0;
              const recent = (now - this._lastPostCollisionTime) < 200;
              if (!recent && falling) {
                  // Compute proportional impulse for crossbar hit so magnitude matches incoming energy
                  this._altitude = Math.max(this._altitude, centerY - this.y + 16);
                  spawnImpactEffect(this.parent || this, this.x, this.y);
                  const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                  const impact = Math.max(14, Math.min(120, incoming * 1.2));
                  this._vz = -Math.sign(this._vz || 1) * impact * 1.0;
                  this._vy = Math.max(8, Math.abs(this._vy) * 0.5 + impact * 0.25);
                  this._vx = (Math.random() > 0.5 ? 1 : -1) * impact * 0.6;
                  this._pushedOffByPost = true;
                  this._ignorePostCollisions = true;
                  this._lastPostCollisionTime = now;
                  return true;
              }
          } catch (e) {
              console.warn('ball.ts: crossbar collision handling failed', e);
          }
      }

      // Left/Right posts
      if (hitLeft) {
          if (handlePost(this.goal.leftPost)) return true;
      }
      if (hitRight) {
          if (handlePost(this.goal.rightPost)) return true;
      }

      return false;
      return false;
  }

  private handleGoal() {
      if (this._goalScored) return;
      this._goalScored = true;
      this._ballUsed = true; // Stop further checks

    spawnImpactEffect(this.parent || this, this.x, this.y);
      
            // Robust zone lookup: convert to goal-local coords, clamp inside goal area,
            // or fall back to nearest zone so we never pass null for edge cases.
            let zone = null as any;
            if (this.goal) {
                try {
                    const converter = this.parent || this;
                    const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                    const goalLocal = this.goal.toLocal(worldPt);
                    zone = this.goal.getZoneFromPosition(goalLocal.x, goalLocal.y);

                    // If null, clamp the point inside the goal area and retry
                    if (!zone) {
                        try {
                            const ga = this.goal.getGoalArea();
                            const clampX = Math.max(ga.x, Math.min(ga.x + ga.width - 1, goalLocal.x));
                            const clampY = Math.max(ga.y, Math.min(ga.y + ga.height - 1, goalLocal.y));
                            zone = this.goal.getZoneFromPosition(clampX, clampY);
                        } catch (e) {
                            zone = null;
                        }
                    }

                    // If still null, pick the nearest zone center as a best-effort fallback
                    if (!zone) {
                        try {
                            const zones = this.goal.getGoalZones();
                            if (zones && zones.length) {
                                let best = zones[0];
                                let bestD = Infinity;
                                for (const z of zones) {
                                    const cx = z.x + z.width / 2;
                                    const cy = z.y + z.height / 2;
                                    const dx1 = cx - goalLocal.x;
                                    const dy1 = cy - goalLocal.y;
                                    const d = dx1 * dx1 + dy1 * dy1;
                                    if (d < bestD) { bestD = d; best = z; }
                                }
                                zone = best;
                            }
                        } catch (e) {
                            zone = null;
                        }
                    }
                } catch (e) {
                    try { zone = this.goal.getZoneFromPosition(this.x, this.y); } catch (e) { zone = null; }
                }
            }
            if (this.goalScoredCallback) this.goalScoredCallback(zone);
      
      // Stop ball inside net
            // Instead of snapping _z, set a target Z and let update() smoothly interpolate
            this._targetZ = Math.min(this._z, this.GOAL_DISTANCE);
            // Move slightly into the net (gentle forward) but cap forward velocity
            this._vz = Math.min(this._vz, 3);
            this._vx *= 0.2;
            // Give a small downward impulse so the ball falls into the net and settles
            this._vy = -6;
            // Keep moving flag true so update() continues physics until settled
            this._isMoving = true;
  }

  private triggerGoalkeeper() {
            // Robust zone lookup for keeper logic (avoid null when ball sits on posts)
            let zone = null as any;
            if (this.goal) {
                try {
                    const converter = this.parent || this;
                    const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                    const goalLocal = this.goal.toLocal(worldPt);
                    zone = this.goal.getZoneFromPosition(goalLocal.x, goalLocal.y);
                    if (!zone) {
                        try {
                            const ga = this.goal.getGoalArea();
                            const clampX = Math.max(ga.x, Math.min(ga.x + ga.width - 1, goalLocal.x));
                            const clampY = Math.max(ga.y, Math.min(ga.y + ga.height - 1, goalLocal.y));
                            zone = this.goal.getZoneFromPosition(clampX, clampY);
                        } catch (e) { zone = null; }
                    }
                    if (!zone) {
                        try {
                            const zones = this.goal.getGoalZones();
                            if (zones && zones.length) {
                                let best = zones[0];
                                let bestD = Infinity;
                                for (const z of zones) {
                                    const cx = z.x + z.width / 2;
                                    const cy = z.y + z.height / 2;
                                    const dx1 = cx - goalLocal.x;
                                    const dy1 = cy - goalLocal.y;
                                    const d = dx1 * dx1 + dy1 * dy1;
                                    if (d < bestD) { bestD = d; best = z; }
                                }
                                zone = best;
                            }
                        } catch (e) { zone = null; }
                    }
                } catch (e) {
                    try { zone = this.goal.getZoneFromPosition(this.x, this.y); } catch (e) { zone = null; }
                }
            }
      const ballRadius = this.ballSprite.width / 2;

      this.goalkeeper.attemptCatch(this.x, this.y, zone, ballRadius).then((result: any) => {
          if (result.caught) {
              // When keeper saves, send ball out and disable post/crossbar collisions
              this._ignorePostCollisions = true;
              this._ballUsed = true; // Keeper caught/blocked it
              this._keeperCooldown = true;
              
              spawnImpactEffect(this.parent || this, this.x, this.y);
              console.log("Saved by Keeper!");
              
              // Ensure ball renders above the goalkeeper when saved
              try {
                  const p = this.parent;
                  if (p && this.goalkeeper && this.goalkeeper.parent === p && typeof (p as any).getChildIndex === 'function' && typeof (p as any).setChildIndex === 'function') {
                      const keeperIndex = (p as any).getChildIndex(this.goalkeeper);
                      const topIndex = Math.max(0, Math.min((p as any).children.length - 1, keeperIndex + 1));
                      (p as any).setChildIndex(this, topIndex);
                  }
              } catch (e) {
                  console.warn('ball.ts: failed to re-layer ball above goalkeeper', e);
              }

              // Physics Deflection: compute impulse proportional to incoming energy
              const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
              const impact = Math.max(18, Math.min(110, incoming * 1.2));
              this._vz = -Math.sign(this._vz || 1) * impact * 1.1;
              this._vy = Math.max(6, Math.abs(this._vy) * 0.5 + impact * 0.22);
              this._vx = (Math.random() > 0.5 ? 1 : -1) * impact * 0.9;
              // Ensure further post collisions don't re-intercept the ball
              this._ignorePostCollisions = true;

              // Ensure visual scale updates immediately as ball moves after save
              try {
                  this._displayScale = null;
                  this._targetZ = null;
                  // Force one-frame scale recompute so the ball appears larger when popped up
                  try {
                      const yNorm = Math.max(0, Math.min(1, this.y / BASE_HEIGHT));
                      const minFactor = 0.35;
                      const maxFactor = 1.0;
                      const visualFactor = maxFactor - (maxFactor - minFactor) * yNorm;
                          const immediateScale = this._baseScale * visualFactor;
                          // Set the smoothed display scale and apply the same scale used in update()
                          this._displayScale = immediateScale;
                          this.ballSprite.scale.set(0.8 * immediateScale, 0.8 * immediateScale);
                          // Prevent update() from immediately lerping away for a frame or two
                          this._forceScaleFrames = 2;
                  } catch (e) {}
              } catch (e) {}

              if (this.saveCallback) this.saveCallback();
              
              setTimeout(() => this._keeperCooldown = false, 1000);
          }
          else {
              // Keeper missed: ignore future goalkeeper collisions for this shot
              this._ignoreGoalkeeper = true;

              // Keeper missed: ensure the ball is rendered beneath the goalkeeper
              try {
                  const p = this.parent;
                  if (p && this.goalkeeper && this.goalkeeper.parent === p && typeof (p as any).getChildIndex === 'function' && typeof (p as any).setChildIndex === 'function') {
                      const keeperIndex = (p as any).getChildIndex(this.goalkeeper);
                      const newIndex = Math.max(0, keeperIndex - 1);
                      (p as any).setChildIndex(this, newIndex);
                  }
              } catch (e) {
                  console.warn('ball.ts: failed to re-layer ball under goalkeeper', e);
              }
          }
      });
  }

  private finishTurn() {
      if (!this._isMoving) return;
      this._isMoving = false;
      // Re-enable post collisions once the play finishes
      this._ignorePostCollisions = false;
      
      if (!this._goalScored && !this._ballUsed) {
          // Final goal check: only after ball has stopped
          const MAX_GOAL_HEIGHT = 140;
          const inNet = this.goal && (this._potentialGoal || this.goal.isInGoalArea(this.x, this.y)) && this._altitude < MAX_GOAL_HEIGHT;
          if (inNet) {
              // clear potential flag and run goal handling (this may resume motion into net)
              this._potentialGoal = false;
              this.handleGoal();
              return;
          }

          // Not a goal: ball is out or stopped outside net — ensure it's rendered beneath the goalkeeper
          try {
              const p = this.parent;
              if (p && this.goalkeeper && this.goalkeeper.parent === p && typeof (p as any).getChildIndex === 'function' && typeof (p as any).setChildIndex === 'function') {
                  const keeperIndex = (p as any).getChildIndex(this.goalkeeper);
                  const newIndex = Math.max(0, keeperIndex - 1);
                  (p as any).setChildIndex(this, newIndex);
              }
          } catch (e) { console.warn('ball.ts: failed to re-layer ball on out', e); }

          if (this.outCallback) this.outCallback();
      }

      if (this.onBallDestroyed) {
          setTimeout(this.onBallDestroyed, 1000);
      }
  }

  public destroy() {
      PIXI.Ticker.shared.remove(this.onEnterFrame);
      this.removeAllListeners();
            try {
                window.removeEventListener('pointerdown', this._globalPointerDown);
                window.removeEventListener('pointermove', this._globalPointerMove);
                window.removeEventListener('pointerup', this._globalPointerUp);
            } catch (e) {}
            super.destroy();
  }
}