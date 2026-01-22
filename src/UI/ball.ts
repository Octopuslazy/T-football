import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { soundController } from '../ControllUI/SoundController';
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
    // State machine for clearer collision flows
    private _state: 'IDLE'|'FLYING'|'BOUNCING_GROUND'|'HIT_POST_IN'|'HIT_POST_OUT'|'HIT_BAR_UP'|'HIT_BAR_DOWN'|'STUCK_IN_NET' = 'IDLE';
    private _goalConfirmed: boolean = false; // set when ball planar-crosses the goal line
    private _pendingBarDown: boolean = false; // track bar-down -> ground resolution
    private _lastPostHitSide: 'left'|'right'|null = null;
    private _lastPostHitTime: number = 0;
    // Previous frame position (for swept collision tests)
    private _prevX: number = 0;
    private _prevY: number = 0;
  
  // Constants
  private readonly GOAL_DISTANCE = 600; // Khoảng cách từ điểm sút đến khung thành
  private readonly GRAVITY = 1.1;
  private readonly FRICTION = 0.99;
  private readonly GROUND_Y_OFFSET = 100; // Điều chỉnh mặt đất
  // Collision tuning (Matter.js-like response helpers)
  private readonly RESTITUTION_POST = 0.75; // energy retained after post hit
  private readonly RESTITUTION_CROSS = 0.72;
  private readonly TANGENTIAL_FRICTION = 0.8; // reduce tangential component on contact

  private vecLen3 = (x:number,y:number,z:number) => Math.sqrt(x*x + y*y + z*z);
  private normalize3 = (x:number,y:number,z:number) => {
      const l = Math.sqrt(x*x + y*y + z*z) || 1e-6; return { x: x/l, y: y/l, z: z/l };
  }
  private dot3 = (ax:number,ay:number,az:number, bx:number,by:number,bz:number) => ax*bx + ay*by + az*bz;
  private reflectVec3 = (vx:number,vy:number,vz:number, nx:number,ny:number,nz:number, restitution:number) => {
      const dot = this.dot3(vx,vy,vz, nx,ny,nz);
      // v' = v - 2*(v·n)*n
      const rx = vx - 2 * dot * nx;
      const ry = vy - 2 * dot * ny;
      const rz = vz - 2 * dot * nz;
      return { x: rx * restitution, y: ry * restitution, z: rz * restitution };
  }

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
    public goalConfirmCallback?: () => void; // called immediately when ball crosses plane into goal
    public onGroundHit?: (z:number, x:number, y:number) => void; // called when ball hits ground
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
        // initialize previous position for swept collision detection
        this._prevX = this.x;
        this._prevY = this.y;
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
    this._state = 'FLYING';
    // Ensure we allow goalkeeper checks for the new shot by default
    this._ignoreGoalkeeper = false;
    this._ballUsed = false;
    this._goalScored = false;
    this._goalConfirmed = false;
    this._pendingBarDown = false;
    this._lastPostHitSide = null;
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

    // Planar goal confirmation: the instant the ball crosses the goal plane
    try {
        if (!this._goalConfirmed && this.goal && this._z >= this.GOAL_DISTANCE && this.goal.isInGoalArea(this.x, this.y)) {
            this._goalConfirmed = true;
            try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
        }
    } catch (e) {}

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

    // If ball is not in the net and has passed the visual bottom of the net,
    // move its display layer to be right after the goal container so it renders
    // 'after' the net (visually above net art but below front elements).
    try {
        if (this.goal && this.parent) {
            const nb = this.goal.netSprite && this.goal.netSprite.getBounds ? this.goal.netSprite.getBounds() : null;
            if (nb) {
                const netBottomY = nb.y + nb.height;
                let inNetLocal = false;
                try {
                    const converter = this.parent || this;
                    const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                    const goalLocal = this.goal.toLocal(worldPt);
                    inNetLocal = !!(this.goal && this.goal.isInGoalArea(goalLocal.x, goalLocal.y));
                } catch (e) { inNetLocal = false; }

                if (!inNetLocal && this.y > netBottomY) {
                    try {
                        const p = this.parent as any;
                        const goalIndex = p && typeof p.getChildIndex === 'function' ? p.getChildIndex(this.goal) : -1;
                        if (goalIndex >= 0) {
                            // place ball immediately after goal container so it appears after the net
                            const targetIndex = Math.min(p.children.length - 1, goalIndex + 1);
                            p.setChildIndex(this, targetIndex);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (e) {}

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
        // If we were in a special 'bar-down' case, resolve on ground: decide goal/miss
        if (this._pendingBarDown) {
            const goalLineZ = this.GOAL_DISTANCE;
            if (this._z >= goalLineZ) {
                this.handleGoal();
                this._pendingBarDown = false;
                // keep moving so net settle works
                this._isMoving = true;
                return;
            } else {
                // Miss: mark as pushed off and proceed with normal bounce
                this._pushedOffByPost = true;
                this._pendingBarDown = false;
            }
        }

        if (Math.abs(this._vy) > 2) {
            this._vy = -this._vy * 0.5; // Bounce energy loss
            this._vx *= 0.8;
            this._vz *= 0.8;
            this._state = 'BOUNCING_GROUND';
            // Fire ground hit event for AI / keeper to re-evaluate
            try { if (this.onGroundHit) this.onGroundHit(this._z, this.x, this.y); } catch (e) {}
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

    // store previous position for next frame (used by swept collision tests)
    try { this._prevX = this.x; this._prevY = this.y; } catch (e) {}
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

      const now = Date.now();

      // Helper: segment (prev->curr) intersects rect (expanded by radius)
      const segmentIntersectsRect = (x1:number,y1:number,x2:number,y2:number, rect:any, pad:number) => {
          try {
              const left = rect.x - pad;
              const right = rect.x + rect.width + pad;
              const top = rect.y - pad;
              const bottom = rect.y + rect.height + pad;
              // quick reject if both points are on one side
              if ((x1 < left && x2 < left) || (x1 > right && x2 > right) || (y1 < top && y2 < top) || (y1 > bottom && y2 > bottom)) return false;
              // If either endpoint is inside, treat as intersection
              if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;
              if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true;
              // Check intersection with each rect edge
              const lineIntersects = (x1:number,y1:number,x2:number,y2:number, x3:number,y3:number,x4:number,y4:number) => {
                  const denom = (y4 - y3)*(x2 - x1) - (x4 - x3)*(y2 - y1);
                  if (Math.abs(denom) < 1e-6) return false;
                  const ua = ((x4 - x3)*(y1 - y3) - (y4 - y3)*(x1 - x3)) / denom;
                  const ub = ((x2 - x1)*(y1 - y3) - (y2 - y1)*(x1 - x3)) / denom;
                  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
              };
              if (lineIntersects(x1,y1,x2,y2,left,top,right,top)) return true; // top edge
              if (lineIntersects(x1,y1,x2,y2,right,top,right,bottom)) return true; // right
              if (lineIntersects(x1,y1,x2,y2,right,bottom,left,bottom)) return true; // bottom
              if (lineIntersects(x1,y1,x2,y2,left,bottom,left,top)) return true; // left
              return false;
          } catch (e) { return false; }
      };

      // Precise circle-vs-rect intersection using closest point on rect
      const checkHit = (obj: any) => {
          if (!obj) return false;
          try {
              const bounds = obj.getBounds();
              const left = bounds.x;
              const right = bounds.x + bounds.width;
              const top = bounds.y;
              const bottom = bounds.y + bounds.height;
              const closestX = Math.max(left, Math.min(this.x, right));
              const closestY = Math.max(top, Math.min(this.y, bottom));
              const dx = this.x - closestX;
              const dy = this.y - closestY;
              return (dx*dx + dy*dy) <= (r * r + 1e-6);
          } catch (e) { return false; }
      };

      // Perfect Top Bin detection (narrow slot under crossbar near post)
      try {
          if (this.goal && this.goal.crossbar && (this.goal.leftPost || this.goal.rightPost)) {
              const cb = this.goal.crossbar.getBounds();
              // screen Y of crossbar bottom
              const crossY = cb.y + cb.height;
              // Check near left inner edge
              if (this.goal.leftPost) {
                  const lb = this.goal.leftPost.getBounds();
                  const innerX = lb.x + lb.width; // inner edge
                  const dx = Math.abs(this.x - innerX);
                  const dy = Math.abs(this.y - (crossY + 4)); // just under crossbar
                  if (dx < 12 && dy < 18 && this.goal.isInGoalArea(this.x, this.y) && this._z >= this.GOAL_DISTANCE) {
                      // Perfect top-bin into left corner
                      spawnImpactEffect(this.parent || this, this.x, this.y);
                      soundController.playSfx('./Assets/sound/click.mp3');
                      soundController.playSfx('./Assets/sound/click.mp3');
                      this._state = 'STUCK_IN_NET';
                      // mark as goal immediately (planar check)
                      this._goalConfirmed = true;
                      try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
                      // Let the ball be visually stuck for a bit
                      this.handleGoal();
                      this._ignorePostCollisions = true;
                      setTimeout(() => {
                          // after being stuck, drop it down
                          this._state = 'FLYING';
                          this._ignorePostCollisions = false;
                          this._vz = Math.max(4, this._vz * 0.2);
                          this._vy = -6;
                      }, 1400);
                      return true;
                  }
              }
              // Right side
              if (this.goal.rightPost) {
                  const rb = this.goal.rightPost.getBounds();
                  const innerX = rb.x; // inner edge (left edge of right post)
                  const dx = Math.abs(this.x - innerX);
                  const dy = Math.abs(this.y - (cb.y + cb.height + 4));
                  if (dx < 12 && dy < 18 && this.goal.isInGoalArea(this.x, this.y) && this._z >= this.GOAL_DISTANCE) {
                      spawnImpactEffect(this.parent || this, this.x, this.y);
                      soundController.playSfx('./Assets/sound/click.mp3');
                      soundController.playSfx('./Assets/sound/click.mp3');
                      this._state = 'STUCK_IN_NET';
                      this._goalConfirmed = true;
                      try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
                      this.handleGoal();
                      this._ignorePostCollisions = true;
                      setTimeout(() => {
                          this._state = 'FLYING';
                          this._ignorePostCollisions = false;
                          this._vz = Math.max(4, this._vz * 0.2);
                          this._vy = -6;
                      }, 1400);
                      return true;
                  }
              }
          }
      } catch (e) {}

      // Crossbar and posts
    // Use swept collision: test segment from previous frame to current position
    const prevX = typeof this._prevX === 'number' ? this._prevX : this.x;
    const prevY = typeof this._prevY === 'number' ? this._prevY : this.y;
    // Use a slightly larger pad for swept checks to be conservative at high speed
    const sweptPad = Math.max(6, r * 1.1);
    const hitLeft = (this.goal.leftPost && (checkHit(this.goal.leftPost) || segmentIntersectsRect(prevX, prevY, this.x, this.y, this.goal.leftPost.getBounds(), sweptPad)));
    const hitRight = (this.goal.rightPost && (checkHit(this.goal.rightPost) || segmentIntersectsRect(prevX, prevY, this.x, this.y, this.goal.rightPost.getBounds(), sweptPad)));
    const hitCross = (this.goal.crossbar && (checkHit(this.goal.crossbar) || segmentIntersectsRect(prevX, prevY, this.x, this.y, this.goal.crossbar.getBounds(), sweptPad)));

      // Predictive crossbar behavior (bar-up vs bar-down)
      if (hitCross) {
          try {
              const bounds = this.goal.crossbar.getBounds();
              const centerY = bounds.y + bounds.height / 2;
              const falling = this._vy < 0 || this._vz > 0;
              const recent = (now - this._lastPostCollisionTime) < 200;
              if (!recent && falling) {
                  // Determine whether we hit lower edge (bar-down) or top
                  const hitPointY = this.y;
                  const edgeThreshold = centerY + bounds.height * 0.25;
                  spawnImpactEffect(this.parent || this, this.x, this.y);
                  const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                  if (hitPointY > edgeThreshold) {
                      // Bar-down: send downwards and mark pending for ground check
                      this._vy = -Math.abs(this._vy) - Math.max(6, incoming * 0.15);
                      this._vz = Math.min(this._vz, 6);
                      this._vx *= 0.6;
                      this._pendingBarDown = true;
                      this._state = 'HIT_BAR_DOWN';
                      this._lastPostCollisionTime = now;
                      return true;
                  } else {
                      // Regular crossbar deflection (upwards) using normal-based reflection
                      const bounds = this.goal.crossbar.getBounds();
                      // crossbar normal points up in screen space
                      const nx = 0, ny = -1, nz = 0;
                      const refl = this.reflectVec3(this._vx, this._vy, this._vz, nx, ny, nz, this.RESTITUTION_CROSS);
                      // add a small random tangential for drama
                      this._vx = refl.x + (Math.random() - 0.5) * 6;
                      this._vy = Math.max(6, Math.abs(refl.y));
                      this._vz = Math.sign(this._vz || 1) * Math.max(4, Math.abs(refl.z));
                      this._pushedOffByPost = true;
                      this._ignorePostCollisions = true;
                      this._lastPostCollisionTime = now;
                      this._state = 'HIT_BAR_UP';
                      return true;
                  }
              }
          } catch (e) { console.warn('ball.ts: crossbar collision handling failed', e); }
      }

      // Post handling (with inner/outer detection & post-to-post drama)
      const handlePost = (obj: any, side: 'left'|'right') => {
          if (!obj) return false;
          try {
              const bounds = obj.getBounds();
              const postCenterX = bounds.x + bounds.width / 2;
              // approaching if velocity points toward the post center
              const approaching = (postCenterX - this.x) * this._vx > 0;
              const recent = (now - this._lastPostCollisionTime) < 200;
              if (!approaching && recent) return false;

              // Is this an inner-face hit? (vector from post into goal)
              let inNet = false;
              try {
                  const converter = this.parent || this;
                  const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                  const goalLocal = this.goal.toLocal(worldPt);
                  inNet = !!(this.goal && this.goal.isInGoalArea(goalLocal.x, goalLocal.y));
              } catch (e) { inNet = false; }

              // Compute incoming energy magnitude and consult helper to avoid resting on posts
              const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
              try {
                  if (this.preventRestOnPost(obj, incoming, inNet, side)) {
                      // helper handled stopping or special-case; treat as handled
                      this._lastPostCollisionTime = now;
                      return true;
                  }
              } catch (e) {}

              // Slightly different handling for inner-edge hits (roll along the goal mouth)
              const sign = Math.sign(this.x - postCenterX) || 1;
              if (inNet) {
                  // Nudge inward so ball doesn't rest on the post
                  const inwardSign = (side === 'left') ? 1 : -1;
                  const inwardX = postCenterX + inwardSign * (bounds.width / 2 + r + 6);
                  this.x = inwardX;
                  spawnImpactEffect(this.parent || this, this.x, this.y);
                  const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                  const nudge = Math.max(4, Math.min(28, incoming * 0.35));
                  this._vx = inwardSign * nudge;
                  this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
                  this._vy = Math.max(2, Math.abs(this._vy) * 0.3 + nudge * 0.08);
                  this._lastPostCollisionTime = now;
                  this._state = 'HIT_POST_IN';
                  // Post-to-post drama: if recent opposite side inner hit, escalate
                  if (this._lastPostHitSide && this._lastPostHitSide !== side && (now - this._lastPostHitTime) < 800) {
                      // strong horizontal transfer
                      this._vx = (side === 'left' ? 1 : -1) * Math.max(12, Math.abs(this._vx) * 1.2);
                  }
                  this._lastPostHitSide = side;
                  this._lastPostHitTime = now;
                  return true;
              }

              // Outer-face hit: bounce out proportional to incoming energy
              const outX = postCenterX + sign * (bounds.width / 2 + r + 12);
              this.x = outX;
              spawnImpactEffect(this.parent || this, this.x, this.y);
              const oldVx = this._vx;
              // Post normal (approx): horizontal from post center toward ball
              const nx = Math.sign(this.x - postCenterX) || 1;
              const ny = 0;
              const nz = 0;
              const refl = this.reflectVec3(this._vx, this._vy, this._vz, nx, ny, nz, this.RESTITUTION_POST);
              // small random tangential component
              this._vx = refl.x + (Math.random() - 0.5) * 4;
              this._vz = refl.z;
              this._vy = Math.abs(refl.y);
              this._altitude = Math.max(this._altitude, 8 + Math.abs(oldVx) * 0.02);
              if (!inNet) {
                  this._pushedOffByPost = true;
                  this._ignorePostCollisions = true;
              }
              this._lastPostCollisionTime = now;
              this._state = 'HIT_POST_OUT';
              // record side
              this._lastPostHitSide = side;
              this._lastPostHitTime = now;
              return true;
          } catch (e) { console.warn('ball.ts: post collision handling failed', e); return false; }
      };

      if (hitLeft) { if (handlePost(this.goal.leftPost, 'left')) return true; }
      if (hitRight) { if (handlePost(this.goal.rightPost, 'right')) return true; }

      return false;
  }

  // Prevent ball from resting on a post. Returns true if the helper handled the collision
  private preventRestOnPost(obj: any, incoming: number, inNet: boolean, side: 'left'|'right'): boolean {
      try {
          // We never want the ball to remain physically stuck on a post.
          // If the ball is inside the net, treat this as a goal immediately and let
          // the normal goal handling settle the ball into the net (visual only).
          if (inNet) {
              try {
                  spawnImpactEffect(this.parent || this, this.x, this.y);
                  soundController.playSfx('./Assets/sound/click.mp3');
              } catch (e) {}
              // Use existing goal handler which also computes zone and smooths into net
              try { this.handleGoal(); } catch (e) { /* fallback quiet */ }
              // Ensure we don't leave post collisions enabled while settling
              this._ignorePostCollisions = true;
              this._pushedOffByPost = false;
              return true;
          }

          // If not in net, do not allow the ball to rest on the post. Even weak impacts
          // should produce a small outward nudge so the ball rolls away instead of staying stuck.
          try {
              const bounds = obj.getBounds();
              const postCenterX = bounds.x + bounds.width / 2;
              const sign = Math.sign(this.x - postCenterX) || 1;
              // Small outward nudge proportional to incoming energy but clamped
              const nudge = Math.max(6, Math.min(28, incoming * 0.5 + 6));
              this.x = postCenterX + sign * (bounds.width / 2 + (this.ballSprite.width/2) * 0.8 + 8);
              spawnImpactEffect(this.parent || this, this.x, this.y);
              this._vx = sign * nudge;
              this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
              this._vy = Math.max(2, Math.abs(this._vy) * 0.25 + nudge * 0.04);
              this._altitude = Math.max(this._altitude, 6);
              this._lastPostCollisionTime = Date.now();
              this._pushedOffByPost = true;
              // Keep collisions enabled so subsequent interactions still work
              return true;
          } catch (e) { return false; }
      } catch (e) { return false; }
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