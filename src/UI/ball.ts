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
    private readonly GRAVITY = 0.9;
  private readonly FRICTION = 0.99;
  private readonly GROUND_Y_OFFSET = 100; // Điều chỉnh mặt đất
  // Collision tuning (Matter.js-like response helpers)
  private readonly RESTITUTION_POST = 0.75; // energy retained after post hit
  private readonly RESTITUTION_CROSS = 0.72;
  private readonly TANGENTIAL_FRICTION = 0.8; // reduce tangential component on contact
    // Maximum allowed altitude (screen units) to count as a goal (below crossbar)
    private readonly MAX_GOAL_HEIGHT = 140;

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
          // apply restitution (scale outgoing velocity)
          return { x: rx * restitution, y: ry * restitution, z: rz * restitution };
      };
      private _isMoving = false;
    private _debugLogs: boolean = false;
  private _isDragging = false;
  private _dragPath: Array<{ x: number; y: number }> = [];
  private _dragTime = 0;
  private _goalScored = false;      // Đã xác nhận bàn thắng chưa
  private _ballUsed = false;        // Bóng đã vào lưới hoặc ra ngoài chưa
    private _pushedOffByPost = false; // ball was forcefully pushed off by post/crossbar
    private _potentialGoal = false;   // Candidate goal detected during flight
    private _targetZ: number | null = null; // Smoothly move _z toward this target when set
    private _everOverBar: boolean = false; // true if during this shot the ball was seen over the crossbar
    private _keeperCooldown = false;  // Cooldown sau khi thủ môn chạm bóng
    private _keeperRequestInFlight: boolean = false; // prevent concurrent keeper requests
    private _allowGoalAttract = true; // Per-shot flag: disable attraction for mostly-horizontal swipes
    private _displayScale: number | null = null; // Smoothed visual scale to avoid snapping
    private _forceScaleFrames: number = 0; // skip lerp for a few frames after forced scale
    private _lastPostCollisionTime: number = 0;
    private _ignorePostCollisions: boolean = false; // temporarily disable post collisions (e.g., on keeper save)
    private _ignoreGoalkeeper: boolean = false; // when true, skip goalkeeper interactions for this shot
    private _goalPending: boolean = false; // defer final goal decision until stop
    private _savedPending: boolean = false; // defer keeper-save decision until stop
    private _netContacted: boolean = false; // whether we've already reported net contact this shot
    private _lastNetContactTime: number | null = null;
    private _lastNetContactZ: number | null = null;

  // External Refs
  public goal: any;
  public goalkeeper: any;
  public gameState: any;
  
  // Callbacks
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
    public goalConfirmCallback?: () => void; // called immediately when ball crosses plane into goal
    public onGroundHit?: (z:number, x:number, y:number) => void; // called when ball hits ground
        public onNetContact?: (scale: number) => void; // called when ball contacts the net/goal plane with visual scale
  public saveCallback?: () => void;
  public outCallback?: () => void;

    // Enable/disable debug logs at runtime
    public setDebugLogs(enable: boolean) { this._debugLogs = !!enable; }

    // Temporary debug overlay (drawn into the ball's parent) for diagnosing edge collisions
    private _debugOverlayGraphics: PIXI.Graphics | null = null;
    private _debugOverlayText: PIXI.Text | null = null;
    private _debugOverlayEnabled: boolean = false;
    private _debugOverlayTimeout: any = null;

    // Enable a temporary debug overlay that draws the world bounds and ball position.
    // Auto-disables after `durationMs` (default 10000ms).
    public enableDebugOverlay(durationMs: number = 10000) {
        try {
            if (!this.parent) return;
            // Clean up any existing overlay
            this.disableDebugOverlay();

            this._debugOverlayGraphics = new PIXI.Graphics();
            this._debugOverlayText = new PIXI.Text('', { fontSize: 12, fill: 0xffffff, wordWrap: true });
            // Add below UI elements by inserting at index 0 so it doesn't block input; caller can adjust
            try { (this.parent as any).addChild(this._debugOverlayGraphics); (this.parent as any).addChild(this._debugOverlayText); } catch (e) {
                // fallback: attach to this container
                this.addChild(this._debugOverlayGraphics);
                this.addChild(this._debugOverlayText);
            }
            this._debugOverlayEnabled = true;
            // Auto-disable after duration
            this._debugOverlayTimeout = setTimeout(() => this.disableDebugOverlay(), durationMs);
        } catch (e) { /* ignore */ }
    }

    public disableDebugOverlay() {
        try {
            if (this._debugOverlayTimeout) { clearTimeout(this._debugOverlayTimeout); this._debugOverlayTimeout = null; }
            if (this._debugOverlayGraphics) {
                try { if (this._debugOverlayGraphics.parent) this._debugOverlayGraphics.parent.removeChild(this._debugOverlayGraphics); } catch (e) {}
                try { this._debugOverlayGraphics.destroy(); } catch (e) {}
                this._debugOverlayGraphics = null;
            }
            if (this._debugOverlayText) {
                try { if (this._debugOverlayText.parent) this._debugOverlayText.parent.removeChild(this._debugOverlayText); } catch (e) {}
                try { this._debugOverlayText.destroy(); } catch (e) {}
                this._debugOverlayText = null;
            }
            this._debugOverlayEnabled = false;
        } catch (e) {}
    }

  private onEnterFrame!: () => void;
    private _baseScale = 0.6;
    private _groundLevelY = 0;
        private _powerMultiplier = 1.4; // slightly reduced shot power per request
        // Velocity caps to avoid extremely large forces from long/fast swipes
        private readonly MAX_VX = 28;
        private readonly MAX_VY = 30;
        private readonly MAX_VZ = 60;
        // Minimum velocity floors so weak swipes still reach the net
        private readonly MIN_VX = 10;
        private readonly MIN_VY = 12;
        private readonly MIN_VZ = 10;
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
    this._keeperRequestInFlight = false; // reset any pending keeper requests
    this._ballUsed = false;
    this._goalScored = false;
    this._goalConfirmed = false;
    this._netContacted = false;
    this._pushedOffByPost = false; // reset post collision flag
    this._targetZ = null; // clear any goal settling
        this._everOverBar = false;
    this._pendingBarDown = false;
    this._lastPostHitSide = null;
    // Prevent immediate scale snapping: keep the current displayed scale for a few frames
    try {
        const currentRendered = (this.ballSprite && this.ballSprite.scale && this.ballSprite.scale.x) ? this.ballSprite.scale.x / 0.8 : null;
        if (currentRendered !== null) this._displayScale = currentRendered;
        this._forceScaleFrames = 8; // hold scale for ~8 frames (~130ms at 60fps)
    } catch (e) {}
        // Ensure ball renders above goalkeeper at shot start
        try { this.setAboveKeeper(); } catch (e) {}
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
    // Also disable attraction if ball was pushed off by post collision.
    const approachStart = this.GOAL_DISTANCE * 0.5; // start applying at 50% of distance
    const approachEnd = this.GOAL_DISTANCE + 200;   // small margin past goal plane
    if (this._allowGoalAttract && !this._pushedOffByPost && this.goal && this.goal.goalSprite && this._vz > 0 && this._z >= approachStart && this._z <= approachEnd) {
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

    // Compute current final (un-smoothed) scale based on world/screen Y
    // and derive a small speed modulation so larger (closer) balls feel slightly faster.
    const _scaleConverter = this.parent || this;
    const worldPtForScaleNow = _scaleConverter.toGlobal(new PIXI.Point(this.x, this.y));
    const finalScaleNow = this.computeFinalScaleForY(worldPtForScaleNow.y);
    const visualFactorNow = finalScaleNow / this._baseScale;
    const _speedMod = 1 + (visualFactorNow - 0.65) * 0.12; // subtle tuning
    const speedModClamped = Math.max(0.85, Math.min(1.15, _speedMod));

    // Move positions (will apply speed modulation below)
    const oldX = this.x;
    this.x += this._vx * speedModClamped;
    // Log large position changes that could indicate teleportation
    if (this._debugLogs && Math.abs(this.x - oldX) > 50) {
        console.log('BALL: LARGE_X_CHANGE', { 
            oldX: oldX.toFixed(1), newX: this.x.toFixed(1), 
            deltaX: (this.x - oldX).toFixed(1), vx: this._vx.toFixed(2), 
            speedMod: speedModClamped.toFixed(3), state: this._state 
        });
    }
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
        this._z += this._vz * speedModClamped;
    }
    this._altitude += this._vy * speedModClamped;

    // Planar goal confirmation: the instant the ball crosses the goal plane
    try {
        // Only treat a plane crossing as a goal when the ball is inside the goal area
        // and not clearly over the crossbar (altitude must be below MAX_GOAL_HEIGHT).
        if (!this._goalConfirmed && this.goal && this._z >= this.GOAL_DISTANCE && this.goal.isInGoalArea(this.x, this.y) && this._altitude < this.MAX_GOAL_HEIGHT) {
            this._goalConfirmed = true;
            try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
            if (this._debugLogs) {
                try { console.log('BALL: GOAL_PLANE_CROSSED', { x:this.x.toFixed(1), y:this.y.toFixed(1), z:this._z.toFixed(2), scale: this.getVisualScale() }); } catch(e) {}
            }
        } else if (this.goal && this._z >= this.GOAL_DISTANCE && this.goal.isInGoalArea(this.x, this.y) && this._altitude >= this.MAX_GOAL_HEIGHT) {
            // Ball entered goal plane footprint but is above the crossbar — ignore as goal.
            // Record that during this shot the ball went over the bar so we won't
            // later accept a plane crossing as a goal for the same shot.
            this._everOverBar = true;
            if (this._debugLogs) {
                try { console.log('BALL: GOAL_PLANE_IGNORED_OVER_BAR', { x:this.x.toFixed(1), y:this.y.toFixed(1), z:this._z.toFixed(2), altitude: this._altitude.toFixed(1) }); } catch(e) {}
            }
        }
    } catch (e) {}

    // Visual net-contact detection: check overlap between ball and goal.netSprite
    try {
        this.checkNetContact();
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
    const newY = currentGroundVisualY - this._altitude;
    // Only block truly invalid coordinates (NaN/Infinity), allow off-screen positions
    if (Number.isFinite(newY)) {
        this.y = newY;
    } else {
        if (this._debugLogs) console.log('BALL: INVALID_Y_COORD', { newY, currentGroundVisualY, altitude: this._altitude });
    }

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

    // Scale Logic: derive visual scale from world/screen Y so
    // when `y` increases (lower on screen) scale increases, and when `y` decreases (higher) scale decreases.
    // Use the smoothed, non-linear mapping from `computeFinalScaleForY` so
    // the ball appears noticeably smaller near the top (keeper region).
    const finalScale = typeof finalScaleNow !== 'undefined' ? finalScaleNow : this.computeFinalScaleForY((this.parent||this).toGlobal(new PIXI.Point(this.x, this.y)).y);
    const visualFactor = finalScale / this._baseScale;
        // Smooth the displayed scale to avoid snapping when bouncing off crossbar/net
        if (this._displayScale === null) {
            // Initialize from current rendered sprite scale (account for 0.8 multiplier)
            const currentRendered = (this.ballSprite && this.ballSprite.scale && this.ballSprite.scale.x) ? this.ballSprite.scale.x / 0.8 : finalScale;
            this._displayScale = currentRendered;
        }
        if (this._forceScaleFrames && this._forceScaleFrames > 0) {
            // Honor the forced display scale for a couple frames to avoid immediate override
            this._forceScaleFrames -= 1;
            this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
        } else {
            // Lerp toward target scale.
            // Use asymmetric lerp so the ball grows faster when moving downward
            // (so players perceive it becoming larger quickly), but shrinks slowly.
            const delta = finalScale - this._displayScale;
            const growLerp = 0.65; // faster when increasing (grow slightly quicker)
            const shrinkLerp = 0.1; // slower when decreasing
            const lerpFactor = delta > 0 ? growLerp : shrinkLerp;
            this._displayScale += delta * lerpFactor;
            this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
        }

    // Visual Rotation
    this.ballSprite.rotation += this._vx * 0.05;

    // 3. Shadow Update
    this.updateShadow(currentGroundVisualY, finalScale);

    // Debug overlay drawing (if enabled)
    if (this._debugOverlayEnabled && this._debugOverlayGraphics) {
        try {
            const g = this._debugOverlayGraphics;
            g.clear();
            // Draw world/design bounds
            g.lineStyle(2, 0xFF0000, 0.9);
            g.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
            // Draw ball position marker (in parent coords)
            const px = this.x;
            const py = this.y;
            g.beginFill(0x00FF00, 0.9);
            g.drawCircle(px, py, 6);
            g.endFill();
            // Small crosshair
            g.lineStyle(1, 0x00FF00, 0.9);
            g.moveTo(px - 10, py);
            g.lineTo(px + 10, py);
            g.moveTo(px, py - 10);
            g.lineTo(px, py + 10);

            if (this._debugOverlayText) {
                this._debugOverlayText.text = `x:${px.toFixed(1)} y:${py.toFixed(1)} z:${this._z.toFixed(1)} alt:${this._altitude.toFixed(1)}`;
                this._debugOverlayText.x = Math.max(4, Math.min(BASE_WIDTH - 160, px + 12));
                this._debugOverlayText.y = Math.max(4, Math.min(BASE_HEIGHT - 24, py - 18));
            }
        } catch (e) {}
    }

    // 4. Ground Collision (Bounce)
    if (this._altitude <= 0) {
        this._altitude = 0;
        // If we were in a special 'bar-down' case, resolve on ground: decide goal/miss
        if (this._pendingBarDown) {
            const goalLineZ = this.GOAL_DISTANCE;
            if (this._z >= goalLineZ) {
                // Before treating bar-down as a goal, verify the ball's world point is inside the net
                try {
                    if (this.goal && this.goal.netSprite && typeof this.goal.netSprite.getBounds === 'function') {
                        const converter = this.parent || this;
                        const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                        const nb = this.goal.netSprite.getBounds();
                        const inside = (worldPt.x >= nb.x && worldPt.x <= nb.x + nb.width && worldPt.y >= nb.y && worldPt.y <= nb.y + nb.height);
                        if (inside) {
                            this.handleGoal();
                            this._pendingBarDown = false;
                            // keep moving so net settle works
                            this._isMoving = true;
                            return;
                        } else {
                            // Not actually inside the net visually — treat as miss
                            this._pushedOffByPost = true;
                            this._pendingBarDown = false;
                        }
                    } else {
                        // No reliable net sprite bounds — fall back to previous behavior
                        this.handleGoal();
                        this._pendingBarDown = false;
                        this._isMoving = true;
                        return;
                    }
                } catch (e) {
                    this._pushedOffByPost = true;
                    this._pendingBarDown = false;
                }
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
            // Debug log for ground bounce
            if (this._debugLogs) {
                console.log('BALL: GROUND_BOUNCE', {
                    x: this.x.toFixed(1), y: this.y.toFixed(1), altitude: this._altitude.toFixed(2), vy: this._vy.toFixed(2), vx: this._vx.toFixed(2), vz: this._vz.toFixed(2), z: this._z.toFixed(2)
                });
            }
            // Fire ground hit event for AI / keeper to re-evaluate
            try { if (this.onGroundHit) this.onGroundHit(this._z, this.x, this.y); } catch (e) {}
        } else {
            this._vy = 0;
            // Roll friction
            this._vx *= 0.9; 
            this._vz *= 0.9;
            if (this._debugLogs) {
                console.log('BALL: ROLL', { x:this.x.toFixed(1), y:this.y.toFixed(1), vx:this._vx.toFixed(2), vz:this._vz.toFixed(2) });
            }
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

    // Emergency state validation: only reset for truly invalid states (NaN, Infinity)
    // Do NOT reset when ball legitimately flies off-screen after post collision
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this._z)) {
        if (this._debugLogs) console.log('BALL: EMERGENCY_RESET_INVALID', { x: this.x, y: this.y, z: this._z });
        // Reset to center field position
        this.x = BASE_WIDTH / 2;
        this.y = (BASE_HEIGHT * 3) / 4;
        this._z = 0.1;
        this._vx = 0.1;
        this._vy = 0.1;
        this._vz = 0.1;
        this._keeperRequestInFlight = false;
        this._ignoreGoalkeeper = true;
        this.finishTurn(); // end the shot immediately
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

  // Return the current visual scale applied to the ball sprite (including 0.8 factor used in update())
  public getVisualScale(): number {
      try {
          // Delegate to computeFinalScaleForY so mapping is consistent and centralized
          const converter = this.parent || this;
          const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
          const finalScale = this.computeFinalScaleForY(worldPt.y);
          const display = this._displayScale === null ? finalScale : this._displayScale;
          return 0.8 * display;
      } catch (e) { return (this._baseScale || 1) * 0.8; }
  }

  // Layering helpers: control whether the ball renders above or below the goalkeeper
  public setAboveKeeper() {
      try {
          const p = this.parent as any;
          const keeper = this.goalkeeper;
          if (p && keeper && keeper.parent === p && typeof p.getChildIndex === 'function' && typeof p.setChildIndex === 'function') {
              const keeperIndex = p.getChildIndex(keeper);
              const topIndex = Math.max(0, Math.min(p.children.length - 1, keeperIndex + 1));
              p.setChildIndex(this, topIndex);
          }
      } catch (e) { /* ignore layering errors */ }
  }

  public setBelowKeeper() {
      try {
          const p = this.parent as any;
          const keeper = this.goalkeeper;
          if (p && keeper && keeper.parent === p && typeof p.getChildIndex === 'function' && typeof p.setChildIndex === 'function') {
              const keeperIndex = p.getChildIndex(keeper);
              const newIndex = Math.max(0, keeperIndex - 1);
              p.setChildIndex(this, newIndex);
          }
      } catch (e) { /* ignore layering errors */ }
  }

  // Reset layering state to default (ball should render above keeper until net contact)
  public resetLayering() {
      try { this.setAboveKeeper(); } catch (e) {}
  }

      // Compute final scale (un-smoothed) for a given screen/world Y position
      private computeFinalScaleForY(worldY: number, screenHeight?: number): number {
          // Non-linear mapping: make the ball noticeably smaller near the top
          const sh = screenHeight || (typeof window !== 'undefined' ? window.innerHeight : BASE_HEIGHT);
          const yNorm = Math.max(0, Math.min(1, worldY / sh));
          const minFactor = 0.4; // smaller at top (keeper area)
          const maxFactor = 1.2; // slightly larger max so ball grows a bit more when low
          const exponent = 1.5; // bias toward smaller values near top
          const visualFactor = minFactor + (maxFactor - minFactor) * Math.pow(yNorm, exponent);
          return this._baseScale * visualFactor;
      }

  // --- COLLISION LOGIC ---

      // Log current scale/state for debugging at important moments
      public checkAndLogScale(eventName: string) {
              try {
                  const visual = this.getVisualScale();
                  const visualScaleVal = Number.isFinite(visual) ? Number((visual as number).toFixed(3)) : Number(visual || 0);
                  const info: any = { event: eventName, state: this._state, x: this.x.toFixed(1), y: this.y.toFixed(1), z: Number(this._z.toFixed(2)), visualScale: visualScaleVal };
                  // compute simple overlap flags (world-space)
                  try {
                      const conv = this.parent || this;
                      const ballB = this.ballSprite.getBounds();
                      const bx = ballB.x + ballB.width/2;
                      const by = ballB.y + ballB.height/2;
                      const br = Math.max(ballB.width, ballB.height)/2 * 0.9;
                      const overlaps: any = {};
                      if (this.goal && this.goal.netSprite) {
                          const nb = this.goal.netSprite.getBounds();
                          const cx = Math.max(nb.x, Math.min(bx, nb.x + nb.width));
                          const cy = Math.max(nb.y, Math.min(by, nb.y + nb.height));
                          overlaps.net = ((bx - cx)*(bx - cx) + (by - cy)*(by - cy)) <= (br*br + 1e-6);
                      }
                      if (this.goal && this.goal.leftPost) {
                          const pb = this.goal.leftPost.getBounds();
                          overlaps.leftPost = !(bx + br < pb.x || bx - br > pb.x + pb.width || by + br < pb.y || by - br > pb.y + pb.height);
                      }
                      if (this.goal && this.goal.rightPost) {
                          const pb = this.goal.rightPost.getBounds();
                          overlaps.rightPost = !(bx + br < pb.x || bx - br > pb.x + pb.width || by + br < pb.y || by - br > pb.y + pb.height);
                      }
                      if (this.goal && this.goal.crossbar) {
                          const cb = this.goal.crossbar.getBounds();
                          overlaps.crossbar = !(bx + br < cb.x || bx - br > cb.x + cb.width || by + br < cb.y || by - br > cb.y + cb.height);
                      }
                      if (this.goalkeeper) {
                          try {
                              const kb = this.goalkeeper.getBounds();
                              overlaps.keeper = !(bx + br < kb.x || bx - br > kb.x + kb.width || by + br < kb.y || by - br > kb.y + kb.height);
                          } catch (e) { overlaps.keeper = false; }
                      }
                      info.overlaps = overlaps;
                  } catch (e) { info.overlapsError = true; }

                  try { console.log('COLLISION_LOG', info); } catch (e) {}
              } catch (e) { try { console.log('BALL_SCALE_LOG_ERROR', e); } catch (ee) {} }
      }

  private checkGameCollisions() {
      // Priority 1: Check Posts/Crossbar
      if (this.checkPostCollisions()) return;

      // Priority 2: Check Goal (Net)
      // Candidate goal only if below crossbar height
      if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
          if (this._altitude < this.MAX_GOAL_HEIGHT) {
              // Candidate goal: defer final decision until ball stops
              this._potentialGoal = true;
          } else {
              // OVER THE BAR
              if (this._debugLogs) console.log('Over the bar!');
              // Ball continues flying...
          }
      }
  }

  // Check visual overlap between ball and goal net sprite and fire onNetContact once
  private checkNetContact() {
      try {
          if (this._netContacted) return;
          if (!this.goal || !this.goal.netSprite) return;
          if (!this.parent) return;
          // Use world bounds for ball (more accurate than approximating radius)
          const ballBounds = this.ballSprite.getBounds();
          const ballCenterX = ballBounds.x + ballBounds.width / 2;
          const ballCenterY = ballBounds.y + ballBounds.height / 2;
          const ballRadius = Math.max(ballBounds.width, ballBounds.height) / 2 * 0.9;

          // Net visual bounds (world coords)
          const netBounds = this.goal.netSprite.getBounds();

          // Closest point on rect
          const closestX = Math.max(netBounds.x, Math.min(ballCenterX, netBounds.x + netBounds.width));
          const closestY = Math.max(netBounds.y, Math.min(ballCenterY, netBounds.y + netBounds.height));
          const dx = ballCenterX - closestX;
          const dy = ballCenterY - closestY;
          const dist2 = dx * dx + dy * dy;

          if (dist2 <= (ballRadius * ballRadius)) {
              this._netContacted = true;
              this._lastNetContactTime = Date.now();
              this._lastNetContactZ = this._z;
              try { this.checkAndLogScale('NET_CONTACT'); } catch (e) {}
              try {
                  const scaleNow = this.getVisualScale();
                  if (this.onNetContact) {
                      try { this.onNetContact(scaleNow); } catch (e) {}
                      this.onNetContact = undefined as any;
                  }
              } catch (e) {}
              try { this.setBelowKeeper(); } catch (e) {}
          }
      } catch (e) { /* ignore */ }
  }

  private checkPostCollisions(): boolean {
      if (this._ignorePostCollisions) return false;
      if (!this.goal) return false;
      const r = (this.ballSprite.width / 2) * 0.8; // Reduced hitbox for realism

      const now = Date.now();
      // Short cooldown to prevent repeated collision retriggers causing "stuck" behavior
      if (now - this._lastPostCollisionTime < 300) {
          if (this._debugLogs) {
              try { console.log('SKIP_POST_COLLISION_COOLDOWN', { since: now - this._lastPostCollisionTime }); } catch (e) {}
          }
          return false;
      }

    // Compute prev/current positions in WORLD coordinates so we're comparing apples->apples
    const converter = this.parent || this;
    const prevGlobal = converter.toGlobal(new PIXI.Point(this._prevX, this._prevY));
    const currGlobal = converter.toGlobal(new PIXI.Point(this.x, this.y));

    // Helper: segment (prev->curr) intersects rect (expanded by radius)
    const segmentIntersectsRect = (wx1:number,wy1:number,wx2:number,wy2:number, rect:any, pad:number) => {
          try {
              const left = rect.x - pad;
              const right = rect.x + rect.width + pad;
              const top = rect.y - pad;
              const bottom = rect.y + rect.height + pad;
              // quick reject if both points are on one side
              if ((wx1 < left && wx2 < left) || (wx1 > right && wx2 > right) || (wy1 < top && wy2 < top) || (wy1 > bottom && wy2 > bottom)) return false;
              // If either endpoint is inside, treat as intersection
              if (wx1 >= left && wx1 <= right && wy1 >= top && wy1 <= bottom) return true;
              if (wx2 >= left && wx2 <= right && wy2 >= top && wy2 <= bottom) return true;
              // Check intersection with each rect edge
              const lineIntersects = (ax:number,ay:number,bx:number,by:number, cx:number,cy:number,dx:number,dy:number) => {
                  const denom = (dy - cy)*(bx - ax) - (dx - cx)*(by - ay);
                  if (Math.abs(denom) < 1e-6) return false;
                  const ua = ((dx - cx)*(ay - cy) - (dy - cy)*(ax - cx)) / denom;
                  const ub = ((bx - ax)*(ay - cy) - (by - ay)*(ax - cx)) / denom;
                  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
              };
              if (lineIntersects(wx1,wy1,wx2,wy2,left,top,right,top)) return true; // top edge
              if (lineIntersects(wx1,wy1,wx2,wy2,right,top,right,bottom)) return true; // right
              if (lineIntersects(wx1,wy1,wx2,wy2,right,bottom,left,bottom)) return true; // bottom
              if (lineIntersects(wx1,wy1,wx2,wy2,left,bottom,left,top)) return true; // left
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
              // use current world coordinates for the ball
              const bx = currGlobal.x;
              const by = currGlobal.y;
              const closestX = Math.max(left, Math.min(bx, right));
              const closestY = Math.max(top, Math.min(by, bottom));
              const dx = bx - closestX;
              const dy = by - closestY;
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
                      const innerX = lb.x + lb.width; // inner edge (world coords)
                      const bx = currGlobal.x;
                      const by = currGlobal.y;
                      const dx = Math.abs(bx - innerX);
                      const dy = Math.abs(by - (crossY + 4)); // just under crossbar (world)
                      const goalLocalForCheck = this.goal.toLocal(new PIXI.Point(bx, by));
                      if (dx < 12 && dy < 18 && this.goal.isInGoalArea(goalLocalForCheck.x, goalLocalForCheck.y) && this._z >= this.GOAL_DISTANCE) {
                      // Perfect top-bin into left corner
                      // Temporarily disabled STUCK_IN_NET handling per request
                      /*
                      spawnImpactEffect(this.parent || this, this.x, this.y);
                      soundController.playSfx('./Assets/sound/click.mp3');
                      soundController.playSfx('./Assets/sound/click.mp3');
                      if (this._debugLogs) console.log('BALL: PERFECT_TOP_BIN', { side: 'left', x:this.x, y:this.y, z:this._z });
                      this._state = 'STUCK_IN_NET';
                      // mark as goal immediately (planar check)
                      this._goalConfirmed = true;
                      try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
                      // Let the ball be visually stuck for a bit
                      this.handleGoal();
                      this._ignorePostCollisions = true;
                      setTimeout(() => {
                          // after being stuck, drop it down
                          this._state = 'FLYING';ư
                          this._ignorePostCollisions = false;
                          this._vz = Math.max(4, this._vz * 0.2);
                          this._vy = -6;
                      }, 1400);
                      return true;
                      */
                  }
              }
              // Right side
                  if (this.goal.rightPost) {
                      const rb = this.goal.rightPost.getBounds();
                      const innerX = rb.x; // inner edge (left edge of right post)
                      const bx = currGlobal.x;
                      const by = currGlobal.y;
                      const dx = Math.abs(bx - innerX);
                      const dy = Math.abs(by - (cb.y + cb.height + 4));
                      const goalLocalForCheck = this.goal.toLocal(new PIXI.Point(bx, by));
                      if (dx < 12 && dy < 18 && this.goal.isInGoalArea(goalLocalForCheck.x, goalLocalForCheck.y) && this._z >= this.GOAL_DISTANCE) {
                      // Temporarily disabled STUCK_IN_NET handling for right-side perfect top-bin
                      /*
                      spawnImpactEffect(this.parent || this, this.x, this.y);
                      soundController.playSfx('./Assets/sound/click.mp3');
                      soundController.playSfx('./Assets/sound/click.mp3');
                      if (this._debugLogs) console.log('BALL: PERFECT_TOP_BIN', { side: 'right', x:this.x, y:this.y, z:this._z });
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
                      */
                  }
              }
          }
      } catch (e) {}

    // Crossbar and posts (use world coords for swept checks)
    const sweptPad = Math.max(6, r * 1.1);
    const hitLeft = (this.goal.leftPost && (checkHit(this.goal.leftPost) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.leftPost.getBounds(), sweptPad)));
    const hitRight = (this.goal.rightPost && (checkHit(this.goal.rightPost) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.rightPost.getBounds(), sweptPad)));
    const hitCross = (this.goal.crossbar && (checkHit(this.goal.crossbar) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.crossbar.getBounds(), sweptPad)));

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
                      if (this._debugLogs) console.log('BALL: CROSSBAR_HIT_DOWN', { x:this.x.toFixed(1), y:this.y.toFixed(1), vy:this._vy.toFixed(2), vz:this._vz.toFixed(2), incoming:incoming.toFixed(2) });
                      try { this.checkAndLogScale('CROSSBAR_HIT_DOWN'); } catch (e) {}
                      if (this._debugLogs) {
                          try {
                              const cb2 = this.goal.crossbar.getBounds();
                              console.log('CROSSBAR_DEBUG', { crossbarTop: cb2.y, crossbarBottom: cb2.y + cb2.height, ballY: this.y, altitude: this._altitude, z: this._z });
                          } catch (e) {}
                      }
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
                      // Clear any goal settling to prevent teleportation back
                      this._targetZ = null;
                      this._goalPending = false;
                      if (this._debugLogs) {
                          try {
                              console.log('CROSSBAR_HIT_UP_DEBUG', { prevGlobal, currGlobal, crossbarBounds: this.goal.crossbar.getBounds(), vx: this._vx, vy: this._vy, vz: this._vz, incoming });
                          } catch (e) {}
                      }
                      // Ensure displayed scale is near the expected visual size after deflection
                      try {
                          const worldPt = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                          const expectedFinal = this.computeFinalScaleForY(worldPt.y);
                          this._displayScale = expectedFinal;
                          this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
                          this._forceScaleFrames = 2;
                      } catch (e) {}
                      if (this._debugLogs) console.log('BALL: CROSSBAR_HIT_UP', { x:this.x.toFixed(1), y:this.y.toFixed(1), vy:this._vy.toFixed(2), vz:this._vz.toFixed(2), incoming:incoming.toFixed(2) });
                      try { this.checkAndLogScale('CROSSBAR_HIT_UP'); } catch (e) {}
                      if (this._debugLogs) {
                          try {
                              const cb2 = this.goal.crossbar.getBounds();
                              console.log('CROSSBAR_DEBUG', { crossbarTop: cb2.y, crossbarBottom: cb2.y + cb2.height, ballY: this.y, altitude: this._altitude, z: this._z });
                          } catch (e) {}
                      }
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
              // approaching if velocity points toward the post center (use world x)
              const approaching = (postCenterX - currGlobal.x) * this._vx > 0;
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
              const sign = Math.sign(currGlobal.x - postCenterX) || 1;
              if (inNet) {
                  // Nudge inward so ball doesn't rest on the post
                  const inwardSign = (side === 'left') ? 1 : -1;
                  const inwardX = postCenterX + inwardSign * (bounds.width / 2 + r + 6);
                  // convert world inwardX back into local coordinates
                  const localIn = converter.toLocal(new PIXI.Point(inwardX, currGlobal.y));
                  // Only block truly invalid coordinates (NaN/Infinity), allow off-screen positions
                  if (Number.isFinite(localIn.x)) {
                      this.x = localIn.x;
                  } else {
                      if (this._debugLogs) console.log('BALL: INVALID_POST_IN_COORD', { localIn, inwardX, currGlobal });
                      // Fallback: manual positioning
                      this.x += (side === 'left' ? 15 : -15);
                  }
                  spawnImpactEffect(this.parent || this, this.x, this.y);
                  const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                  const nudge = Math.max(4, Math.min(28, incoming * 0.35));
                  this._vx = inwardSign * nudge;
                  this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
                  this._vy = Math.max(2, Math.abs(this._vy) * 0.3 + nudge * 0.08);
                  this._lastPostCollisionTime = now;
                  this._state = 'HIT_POST_IN';
                  if (this._debugLogs) console.log('BALL: POST_IN', { side, x:this.x.toFixed(1), y:this.y.toFixed(1), incoming:incoming.toFixed(2), vx:this._vx.toFixed(2), vy:this._vy.toFixed(2), vz:this._vz.toFixed(2) });
                  try { this.checkAndLogScale('POST_IN'); } catch (e) {}
                  // Post-to-post drama: if recent opposite side inner hit, escalate
                  if (this._lastPostHitSide && this._lastPostHitSide !== side && (now - this._lastPostHitTime) < 800) {
                      // strong horizontal transfer
                      this._vx = (side === 'left' ? 1 : -1) * Math.max(12, Math.abs(this._vx) * 1.2);
                  }
                  this._lastPostHitSide = side;
                  this._lastPostHitTime = now;
                  try {
                      const worldPt = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                      const expectedFinal = this.computeFinalScaleForY(worldPt.y);
                      this._displayScale = expectedFinal;
                      this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
                      this._forceScaleFrames = 2;
                  } catch (e) {}
                  return true;
              }

              // Outer-face hit: bounce out proportional to incoming energy
              const outX = postCenterX + sign * (bounds.width / 2 + r + 12);
              const localOut = converter.toLocal(new PIXI.Point(outX, currGlobal.y));
              // Only block truly invalid coordinates (NaN/Infinity), allow off-screen positions
              if (Number.isFinite(localOut.x)) {
                  this.x = localOut.x;
              } else {
                  if (this._debugLogs) console.log('BALL: INVALID_POST_OUT_COORD', { localOut, outX, currGlobal });
                  // Fallback: manual positioning away from post
                  this.x += (sign > 0 ? 20 : -20);
              }
              spawnImpactEffect(this.parent || this, this.x, this.y);
              const oldVx = this._vx;
              // Post normal (approx): horizontal from post center toward ball
              const nx = Math.sign(this.x - postCenterX) || 1;
              const ny = 0;
              const nz = 0;
              const refl = this.reflectVec3(this._vx, this._vy, this._vz, nx, ny, nz, this.RESTITUTION_POST);
              // small random tangential component
              this._vx = refl.x + (Math.random() - 0.5) * 4;
              // Ensure outer-face post collisions tend to send the ball back toward the field (negative Z)
              this._vz = -Math.max(6, Math.abs(refl.z));
              this._vy = Math.abs(refl.y);
              this._altitude = Math.max(this._altitude, 8 + Math.abs(oldVx) * 0.02);
              if (!inNet) {
                  this._pushedOffByPost = true;
                  this._ignorePostCollisions = true;
              }
              this._lastPostCollisionTime = now;
              this._state = 'HIT_POST_OUT';
              // Ensure displayed scale increases toward expected after bouncing off post
              try {
                  const worldPt = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                  const expectedFinal = this.computeFinalScaleForY(worldPt.y);
                  this._displayScale = expectedFinal;
                  this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
                  this._forceScaleFrames = 2;
              } catch (e) {}
              if (this._debugLogs) console.log('BALL: POST_OUT', { side, x:this.x.toFixed(1), y:this.y.toFixed(1), oldVx:oldVx.toFixed(2), vx:this._vx.toFixed(2), vy:this._vy.toFixed(2), vz:this._vz.toFixed(2) });
              try { this.checkAndLogScale('POST_OUT'); } catch (e) {}
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
          // If the ball is inside the net AND moving toward the goal, treat as goal.
          // But if ball is flying away from goal (negative vz), don't force a goal.
          if (inNet && this._vz > -5) {
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
              const newX = postCenterX + sign * (bounds.width / 2 + (this.ballSprite.width/2) * 0.8 + 8);
              // Only block truly invalid coordinates (NaN/Infinity), allow off-screen positions
              if (Number.isFinite(newX)) {
                  this.x = newX;
              } else {
                  if (this._debugLogs) console.log('BALL: INVALID_PREVENT_REST_COORD', { newX, postCenterX, sign, bounds });
                  // Fallback: manual nudge away from post
                  this.x += (sign > 0 ? 25 : -25);
              }
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
      // Mark a pending goal: defer final scoring until the ball stops
      if (this._goalPending) return;
      this._goalPending = true;
      spawnImpactEffect(this.parent || this, this.x, this.y);
      // Visually settle into the net (keep moving so update() will smooth into net)
      this._targetZ = Math.min(this._z, this.GOAL_DISTANCE);
      this._vz = Math.min(this._vz, 3);
      this._vx *= 0.2;
      this._vy = -6;
      this._isMoving = true;
  }

  private triggerGoalkeeper() {
            // avoid concurrent keeper requests
            if (this._keeperRequestInFlight) return;
            this._keeperRequestInFlight = true;
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
          // If the keeper result comes back but the keeper is now far from the ball,
          // treat it as stale (another later keeper attempt may have already handled it).
          try {
              const keeper = this.goalkeeper;
              if (keeper) {
                  const dxk = (this.x - keeper.x);
                  const dyk = (this.y - keeper.y);
                  const dist = Math.sqrt(dxk*dxk + dyk*dyk);
                  // If the keeper is more than ~220px away from current ball, ignore stale result
                  if (dist > 220) {
                      if (this._debugLogs) console.log('KEEPER_RESULT_STALE', { dist });
                      this._keeperRequestInFlight = false;
                      return;
                  }
              }
          } catch (e) {}
          if (result.caught) {
              try { this.checkAndLogScale('KEEPER_SAVE'); } catch (e) {}
              // When keeper saves, send ball out and disable post/crossbar collisions
              this._ignorePostCollisions = true;
              this._savedPending = true; // mark pending save; finalize when ball stops
              // clear any goal candidates for this shot — keeper save overrides
              this._potentialGoal = false;
              this._goalPending = false;
              // ignore further goalkeeper checks for this shot
              this._ignoreGoalkeeper = true;
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
              const oldVx = this._vx, oldVy = this._vy, oldVz = this._vz;
              this._vz = -Math.sign(this._vz || 1) * impact * 0.7; // reduced from 1.1 to 0.7
              this._vy = Math.max(6, Math.abs(this._vy) * 0.5 + impact * 0.15); // reduced from 0.22 to 0.15
              this._vx = (Math.random() > 0.5 ? 1 : -1) * impact * 0.4; // reduced from 0.9 to 0.4
              if (this._debugLogs) {
                  console.log('KEEPER_SAVE_VELOCITY_CHANGE', { 
                      oldV: { x: oldVx.toFixed(2), y: oldVy.toFixed(2), z: oldVz.toFixed(2) },
                      newV: { x: this._vx.toFixed(2), y: this._vy.toFixed(2), z: this._vz.toFixed(2) },
                      impact: impact.toFixed(2), incoming: incoming.toFixed(2)
                  });
              }
              // Ensure further post collisions don't re-intercept the ball
              this._ignorePostCollisions = true;

              // Ensure visual scale updates immediately as ball moves after save
              try {
                  this._displayScale = null;
                  this._targetZ = null;
                  // Force one-frame scale recompute so the ball appears larger when popped up
                  try {
                      const converter = this.parent || this;
                      const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                      const immediateScale = this.computeFinalScaleForY(worldPt.y);
                      // Set the smoothed display scale and apply the same scale used in update()
                      this._displayScale = immediateScale;
                      this.ballSprite.scale.set(0.8 * immediateScale, 0.8 * immediateScale);
                      // Prevent update() from immediately lerping away for a frame or two
                      this._forceScaleFrames = 2;
                  } catch (e) {}
              } catch (e) {}

              // do not call saveCallback here; finalization occurs in finishTurn()
              
              setTimeout(() => this._keeperCooldown = false, 1000);
              this._keeperRequestInFlight = false;
          }
          else {
              // Log a keeper miss distinctly so we can differentiate in the console
              try {
                  // include keeper->ball distance for diagnostics
                  const keeper = this.goalkeeper;
                  let kbInfo: any = { distance: null };
                  try {
                      if (keeper) {
                          const dx = (this.x - keeper.x);
                          const dy = (this.y - keeper.y);
                          kbInfo.distance = Math.sqrt(dx*dx + dy*dy);
                      }
                  } catch (e) {}
                  this.checkAndLogScale('KEEPER_MISS');
                  try { console.log('KEEPER_MISS_INFO', kbInfo, result); } catch (e) {}
              } catch (e) {}
              this._keeperRequestInFlight = false;
              // Keeper missed: ignore future goalkeeper collisions for this shot
              this._ignoreGoalkeeper = true;
              // Keeper missed: do NOT change layering here — keep ball above goalkeeper
              // until the ball actually contacts the net. This avoids visual tunnelling.
              // If the ball overlaps the keeper's current position, nudge the keeper away
              try {
                  const p = this.parent;
                  const keeper = this.goalkeeper;
                  if (keeper && p && keeper.parent === p) {
                      const kx = keeper.x;
                      const ky = keeper.y;
                      const bx = this.x;
                      const by = this.y;
                      const dx = bx - kx;
                      const dy = by - ky;
                      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                      const keeperRadius = (typeof keeper.getCollisionRadius === 'function') ? keeper.getCollisionRadius() : 40;
                      const ballRadius = (this.ballSprite && this.ballSprite.width) ? this.ballSprite.width / 2 : 20;
                      const PAD = 140; // keep this in sync with goalkeeper's KEEPER_SAFE_PADDING
                      const minDist = keeperRadius + ballRadius * 0.8 + PAD;
                      if (dist < minDist) {
                          const nx = (kx - bx) / dist || 1;
                          const ny = (ky - by) / dist || 0;
                          const move = Math.max(minDist - dist + PAD * 0.2, PAD * 0.6);
                          try {
                              // move keeper container immediately to avoid overlap
                              keeper.x = kx + nx * move;
                              keeper.y = ky + ny * move;
                              // temporarily update keeper initial resting pos so it doesn't snap back into the ball
                              try {
                                  const orig = (keeper as any)._initialPosition;
                                  (keeper as any)._initialPosition = { x: keeper.x, y: keeper.y };
                                  setTimeout(() => { try { (keeper as any)._initialPosition = orig; } catch (e) {} }, 1200);
                              } catch (e) {}
                              if (this._debugLogs) console.log('BALL: NUDGE_KEEPER_ON_MISS', { move, keeperX: keeper.x, keeperY: keeper.y, dist, minDist });
                          } catch (e) {}
                      }
                  }
              } catch (e) { /* ignore */ }
          }
      });
  }

  private finishTurn() {
      if (!this._isMoving) return;
      this._isMoving = false;
      try { this.checkAndLogScale('STOPPED'); } catch (e) {}
      // Re-enable post collisions once the play finishes
      this._ignorePostCollisions = false;
      
      // Finalize pending results: saved takes priority over goal
      if (this._savedPending) {
          this._savedPending = false;
          this._ballUsed = true;
          try { if (this.saveCallback) this.saveCallback(); } catch (e) {}
          return;
      }

      // If a goal was previously requested to settle, finalize it now
      // Finalize goal only if ball has stopped and its final position is inside the drawn goal area
      // Also require that a goal candidate existed for this shot to avoid teleport/coordinate-mapping false positives.
      let finalInDrawnArea = false;
      try {
          if (this.goal) {
              // Prefer a world-space check using the ball's world point so transforms are consistent
              try {
                  if (this.goal.netSprite && typeof this.goal.netSprite.getBounds === 'function') {
                      const nb = this.goal.netSprite.getBounds();
                      const converter = this.parent || this;
                      const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                      finalInDrawnArea = (worldPt.x >= nb.x && worldPt.x <= nb.x + nb.width && worldPt.y >= nb.y && worldPt.y <= nb.y + nb.height);
                  }
              } catch (e) { finalInDrawnArea = false; }

              // Fallback to existing local goal area conversion if netSprite bounds unavailable
              if (!finalInDrawnArea) {
                  try {
                      const converter = this.parent || this;
                      const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                      const localPt = this.goal.toLocal(worldPt);
                      const ga = this.goal.getGoalArea();
                      finalInDrawnArea = !!(localPt.x >= ga.x && localPt.x <= ga.x + ga.width && localPt.y >= ga.y && localPt.y <= ga.y + ga.height);
                  } catch (e) { finalInDrawnArea = false; }
              }
          }
      } catch (e) { finalInDrawnArea = false; }

      // Only finalize goal if we actually had a robust goal candidate/confirmation during flight.
      // Exclude transient `_potentialGoal` (which may be set briefly while flying) to avoid
      // teleport/false-positive goals when the ball later leaves the net area.
      // Allow scoring if we had an explicit pending goal/plane confirmation or if we contacted
      // the net and remain at/behind the goal plane.
      const now = Date.now();
      const recentNetContact = !!(this._lastNetContactTime && (now - this._lastNetContactTime) < 2000 && (this._lastNetContactZ !== null && this._lastNetContactZ >= (this.GOAL_DISTANCE - 5)));
      const hadGoalCandidate = !!(
          this._goalPending ||
          this._goalConfirmed ||
          recentNetContact
      );

      if (finalInDrawnArea && hadGoalCandidate) {
          // finalize goal only when ball stopped inside the drawn goal area
          this._goalPending = false;
          this._potentialGoal = false;
          this._goalScored = true;
          this._ballUsed = true;
          // compute zone and call callback (robust lookup)
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
              } catch (e) { try { zone = this.goal.getZoneFromPosition(this.x, this.y); } catch (e) { zone = null; } }
          }
          try { if (this.goalScoredCallback) this.goalScoredCallback(zone); } catch (e) {}
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