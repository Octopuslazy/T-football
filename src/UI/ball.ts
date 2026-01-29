import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { soundController } from '../ControllUI/SoundController';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Ball extends PIXI.Container {
    // --- Visuals ---
    private ballSprite!: PIXI.Sprite;
    private shadowSprite!: PIXI.Graphics;

    // --- Physics & State ---
    private _velocity = { x: 0, y: 0 }; 
    private _z: number = 0;           
    private _altitude: number = 0;    
    private _vx: number = 0;          
    private _vy: number = 0;          
    private _vz: number = 0;          
    private _curveFactor: number = 0; 
    
    private _state: 'IDLE'|'FLYING'|'BOUNCING_GROUND'|'HIT_POST_IN'|'HIT_POST_OUT'|'HIT_BAR_UP'|'HIT_BAR_DOWN'|'STUCK_IN_NET' = 'IDLE';
    private _goalConfirmed: boolean = false; 
    private _pendingBarDown: boolean = false; 
    private _lastPostHitSide: 'left'|'right'|null = null;
    private _lastPostHitTime: number = 0;
    
    private _prevX: number = 0;
    private _prevY: number = 0;
   
    // Constants
    private readonly GOAL_DISTANCE = 600; 
    private readonly VANISHING_POINT_Z = 870;
    private readonly GRAVITY = 0.99;
    private readonly FRICTION = 0.99; // Increase friction slightly so the ball flies steadier
    private readonly FALLBACK_MAX_GOAL_HEIGHT = 160;
    private get MAX_GOAL_HEIGHT(): number {
        try {
            if (this.goal && this.goal.goalSprite && typeof this.goal.goalSprite.y === 'number') {
                return this.goal.goalSprite.y;
            }
        } catch (e) {}
        return this.FALLBACK_MAX_GOAL_HEIGHT;
    }

    // Physics Helpers
    private dot3 = (ax:number,ay:number,az:number, bx:number,by:number,bz:number) => ax*bx + ay*by + az*bz;
    private reflectVec3 = (vx:number,vy:number,vz:number, nx:number,ny:number,nz:number, restitution:number) => {
        const dot = this.dot3(vx,vy,vz, nx,ny,nz);
        const rx = vx - 2 * dot * nx;
        const ry = vy - 2 * dot * ny;
        const rz = vz - 2 * dot * nz;
        return { x: rx * restitution, y: ry * restitution, z: rz * restitution };
    };

    private _isMoving = false;
    private _debugLogs: boolean = true; // Enable logs for debugging
    
    // Input variables
    private _isCharging = false;
    private _chargeStartTime = 0;
    private _dragPath: Array<{ x: number; y: number }> = [];
    
    private _goalScored = false;      
    private _ballUsed = false;        
    private _pushedOffByPost = false; 
    private _potentialGoal = false;   
    private _targetZ: number | null = null; 
    private _everOverBar: boolean = false; 
    private _keeperCooldown = false;  
    private _keeperRequestInFlight: boolean = false; 
    private _displayScale: number | null = null; 
    private _forceScaleFrames: number = 0; 
    private _lastPostCollisionTime: number = 0;
    private _ignorePostCollisions: boolean = false; 
    // Prevent double-applying impulses from post hit/snap within a short window
    private _postImpulseAppliedTime: number = 0;
    private _postImpulseDebounceMs: number = 100; // ms window to ignore duplicate impulses
    private _ignoreGoalkeeper: boolean = false; 
    private _goalPending: boolean = false; 
    private _savedPending: boolean = false; 
    private _netContacted: boolean = false; 
    private _lastNetContactTime: number | null = null;
    private _lastNetContactZ: number | null = null;
    private _snapTargetX: number | null = null;
    private _snapLerpFrames: number = 0;

    private readonly RESTITUTION_POST = 0.75; 
    private readonly RESTITUTION_CROSS = 0.72;

    // External Refs
    public goal: any;
    public goalkeeper: any;
    public gameState: any;
   
    // Callbacks
    public onBallDestroyed?: () => void;
    public goalScoredCallback?: (zone: any) => void;
    public goalConfirmCallback?: () => void; 
    public onGroundHit?: (z:number, x:number, y:number) => void; 
    public onNetContact?: (scale: number) => void; 
    public saveCallback?: () => void;
    public outCallback?: () => void;

    // Debug Overlay
    public setDebugLogs(enable: boolean) { this._debugLogs = !!enable; }
    private _debugOverlayGraphics: PIXI.Graphics | null = null;
    private _debugOverlayText: PIXI.Text | null = null;
    private _debugOverlayEnabled: boolean = false;

    private onEnterFrame!: () => void;
    private _baseScale = 1;
    private _groundLevelY = 0;
    
    // Global Handlers
    private _globalPointerDown!: (e: PointerEvent) => void;
    private _globalPointerMove!: (e: PointerEvent) => void;
    private _globalPointerUp!: (e: PointerEvent) => void;

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

        // Global listeners
        this._globalPointerDown = (ev: PointerEvent) => {
            try {
                if (this._isMoving || this._ballUsed) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerDown({ data: p });
            } catch (e) {}
        };
        this._globalPointerMove = (ev: PointerEvent) => {
            try {
                if (!this._isCharging) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerMove({ data: p });
            } catch (e) {}
        };
        this._globalPointerUp = (ev: PointerEvent) => {
            try {
                if (!this._isCharging) return; 
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerUp({ data: p });
            } catch (e) {}
        };
        
        window.addEventListener('pointerdown', this._globalPointerDown);
        window.addEventListener('pointermove', this._globalPointerMove);
        window.addEventListener('pointerup', this._globalPointerUp);

        this.onEnterFrame = this.update.bind(this);
        PIXI.Ticker.shared.add(this.onEnterFrame);
        
        this.updateScale();
        this._prevX = this.x;
        this._prevY = this.y;
        window.addEventListener('resize', () => this.updateScale());
    }

    private createVisuals() {
        const baseRadius = 45;
        const canvas = document.createElement('canvas');
        canvas.width = baseRadius * 2;
        canvas.height = baseRadius * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(baseRadius, baseRadius, baseRadius, 0, Math.PI * 2);
            ctx.fill();
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

        try {
            const hitR = 60;
            this.hitArea = new PIXI.Circle(0, 0, hitR);
        } catch (e) {}
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

    // --- INPUT HANDLING ---

    private _onPointerDown = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (this._isMoving || this._ballUsed) return;
        
        // Reset visuals
        this.ballSprite.alpha = 1; 
        this.ballSprite.scale.set(this._baseScale);
        if (this.shadowSprite) this.shadowSprite.alpha = 0.3;
        
        this._isCharging = true;
        this._chargeStartTime = performance.now();
        
        const p = e.data.global;
        this._dragPath = [{ x: p.x, y: p.y }];
    };

    private _onPointerMove = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (!this._isCharging) return;
        const p = e.data.global;
        const last = this._dragPath[this._dragPath.length - 1];
        const distSq = (p.x - last.x)*(p.x - last.x) + (p.y - last.y)*(p.y - last.y);
        if (distSq > 5) { 
            this._dragPath.push({ x: p.x, y: p.y });
        }
    };

    // [FIXED] PointerUp handler: corrected order and force logic
    private _onPointerUp = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (!this._isCharging) return;
        this._isCharging = false;

        const now = performance.now();
        const duration = now - this._chargeStartTime;
        
        // [IMPORTANT]: Always push the final point into the array BEFORE checking
        const endPos = e.data.global;
        if (!this._dragPath) this._dragPath = [];
        this._dragPath.push({ x: endPos.x, y: endPos.y });

        // Create fallback data if the array lacks points (avoid logic errors)
        if (this._dragPath.length < 2) {
             const p = {x: endPos.x, y: endPos.y};
             this._dragPath = [p, {x: p.x, y: p.y - 10}];
        }

        const startPos = this._dragPath[0];
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y; 
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Ignore swipe if it's too short (<10px)
        if (dist < 10) return;

        // --- COMPUTE FORCE ---
        const screenW = window.innerWidth || BASE_WIDTH;
        const screenH = window.innerHeight || BASE_HEIGHT;

        const distPercent = dist / screenH;
        const dxPercent = dx / screenW;
        const dyPercent = dy / screenH;

        let speed = (distPercent / Math.max(duration, 140)) * 7000; 
        // Minimum speed 24 to overcome friction
        speed = Math.max(5, Math.min(speed, 48));

        this._curveFactor = this.calculateCurveFactor(startPos, endPos, this._dragPath);
        this._vx = dxPercent * 70 + this._curveFactor * 8;
        if (speed < 16) {
             // Soft shot -> ball rolls or bounces very low (1-3 units)
             this._vy = Math.max(2, Math.abs(dyPercent) * 5);
        } else {
             // Strong shot -> ball lifts (minimum 6 to rise)
             this._vy = Math.max(6, Math.abs(dyPercent) * 20); 
        }
        this._vz = speed;

        // Reset state
        this._z = 0;
        this._altitude = 0;
        this._isMoving = true;
        this._state = 'FLYING';
        
        this._ignoreGoalkeeper = false;
        this._keeperRequestInFlight = false;
        this._ballUsed = false;
        this._goalScored = false;
        this._goalConfirmed = false;
        this._netContacted = false;
        this._pushedOffByPost = false;
        this._targetZ = null;
        this._everOverBar = false;
        this._pendingBarDown = false;
        this._lastPostHitSide = null;

        try { this.setAboveKeeper(); } catch (e) {}
        
        if (this._debugLogs) console.log('SHOT FIRED', {speed, vy: this._vy});
    };

    private calculateCurveFactor(start: {x:number, y:number}, end: {x:number, y:number}, path: any[]) {
         if (path.length < 3) return 0; 
         let maxDeviation = 0;
         const dx = end.x - start.x;
         const dy = end.y - start.y;
         const lenSq = dx*dx + dy*dy;
         if (lenSq < 1e-6) return 0;

         const nx = -dy;
         const ny = dx;
         const len = Math.sqrt(lenSq);
         const unitNx = nx / len;
         const unitNy = ny / len;

         for (let i = 1; i < path.length - 1; i++) {
             const p = path[i];
             const pdx = p.x - start.x;
             const pdy = p.y - start.y;
             const deviation = pdx * unitNx + pdy * unitNy;
             if (Math.abs(deviation) > Math.abs(maxDeviation)) {
                 maxDeviation = deviation;
             }
         }
         return Math.max(-1.2, Math.min(1.2, maxDeviation * 0.006));
     }

    private update() {
        if (!this._isMoving) return;
        const prevZ = this._z;

        // Debug Log Position (to verify the ball is flying)
        if (this._debugLogs && this._z < 100) {
             // console.log(`FLYING: Z=${this._z.toFixed(1)} Alt=${this._altitude.toFixed(1)}`);
        }

        // 1. Physics
        this._vx += this._curveFactor * (this._vz / 60) * 0.9;
        this._vy -= this.GRAVITY;
        this._vx *= this.FRICTION; 
        this._vz *= this.FRICTION; 

        const _speedMod = 1;
        this.x += this._vx * _speedMod;
        
        if (this._targetZ !== null) {
            const dz = this._targetZ - this._z;
            const step = Math.sign(dz) * Math.min(Math.abs(dz), Math.max(2, Math.abs(this._vz) * 0.5));
            this._z += step;
            this._vz *= 0.8;
            if (Math.abs(dz) < 0.5) {
                this._z = this._targetZ;
                this._targetZ = null;
            }
        } else {
            this._z += this._vz * _speedMod;
        }

        // Check Horizon Wall
        

        this._altitude += this._vy * _speedMod;

        // Goal Confirm
        this._altitude += this._vy * _speedMod;


        
        // Inner bar collision (front guides)
        this.checkInnerBarCollision(prevZ, this._z); 
        
        // Outer posts & crossbar collisions
        if (this._z >= this.GOAL_DISTANCE - 50 && !this._ballUsed) {
            this.checkPostCollisions(); 
        }

        // Net collision
        try { this.checkNetContact(); } catch (e) {}
        
        // Game collision (Goal)
        if (this._z >= this.GOAL_DISTANCE && !this._ballUsed) {
             this.checkGameCollisions();
        }

        try {
            if (!this._goalConfirmed && this.goal && this._z >= this.GOAL_DISTANCE && this.goal.isInGoalArea(this.x, this.y)) {
                if (this._altitude < this.MAX_GOAL_HEIGHT) {
                    this._goalConfirmed = true;
                    try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
                } else {
                    this._everOverBar = true;
                }
            }
        } catch (e) {}

        // Perspective Calculation (compute screen Y)
        const tDepth = this._z / this.GOAL_DISTANCE;
        let targetGroundY = this._groundLevelY - 200; 
        if (this.goal && this.goal.goalSprite) {
            try {
                const nb = this.goal.goalSprite.getBounds();
                const worldBottomY = 0.7 * nb.y + nb.height;
                const worldCenterX = nb.x + nb.width / 2;
                const converter = this.parent || this;
                const localPt = converter.toLocal(new PIXI.Point(worldCenterX, worldBottomY));
                targetGroundY = localPt.y;
            } catch (e) { }
        }
        
        let currentGroundVisualY;
        if (tDepth <= 1) {
            currentGroundVisualY = this._groundLevelY + (targetGroundY - this._groundLevelY) * tDepth;
        } else {
            const horizonOffset = 60; 
            const extraDepth = tDepth - 1; 
            const curve = 1 - (1 / (1 + 0.6 * extraDepth));
            currentGroundVisualY = targetGroundY - (horizonOffset * curve);
        }

        const newY = currentGroundVisualY - this._altitude;
        if (Number.isFinite(newY)) {
            this.y = newY;
        }

        // Layering (ball above/below keeper)
        try {
            if (this.parent && this.goal) {
                if (this._z > this.GOAL_DISTANCE - 22 || this._netContacted) {
                    const goalIndex = this.parent.getChildIndex(this.goal);
                    this.parent.setChildIndex(this, Math.max(0, goalIndex - 1));
                } else {
                    if (!this._savedPending && !this._ignoreGoalkeeper) {
                         this.setAboveKeeper();
                    }
                }
            }
        } catch (e) {}

        // Scale & Visuals (Vanishing Effect)
        let finalScale = typeof (this as any).finalScaleNow !== 'undefined' ? (this as any).finalScaleNow : this.computeFinalScaleForY((this.parent||this).toGlobal(new PIXI.Point(this.x, this.y)).y);
        
        let vanishingAlpha = 1.0;
        let vanishingScaleFactor = 1.0;

        const isGoal = this._netContacted || 
                       this._goalPending || 
                       this._goalConfirmed || 
                       this._state === 'STUCK_IN_NET' || 
                       this._goalScored ||
                       (this.goal && this.goal.isInGoalArea(this.x, this.y) && this._altitude < this.MAX_GOAL_HEIGHT);

        if (this._z > this.GOAL_DISTANCE && !isGoal) {
            const totalVanishingDist = this.VANISHING_POINT_Z - this.GOAL_DISTANCE;
            const distPastGoal = this._z - this.GOAL_DISTANCE;
            const vanishingRatio = Math.min(1, Math.max(0, distPastGoal / totalVanishingDist));
            
            vanishingAlpha = 1.0 - Math.pow(vanishingRatio, 1.2);
            vanishingScaleFactor = 1.0 - (vanishingRatio * 0.7);

            if (vanishingAlpha <= 0.02) {
                this.ballSprite.alpha = 0;
                this.finishTurn();
                return; 
            }
        }

        this.ballSprite.alpha = vanishingAlpha;
        if (this.shadowSprite) this.shadowSprite.alpha = vanishingAlpha * 0.3;

        // Don't apply the extra z-based shrink if the ball is already treated as a goal/net rest.
        if (this._z > this.GOAL_DISTANCE && !isGoal) {
            const zBasedFactor = 0.55 * (600 / Math.max(600, this._z));
            const zScale = this._baseScale * zBasedFactor;
            finalScale = Math.min(finalScale, zScale);
        }

        finalScale *= vanishingScaleFactor;

        let dScale: number = (this._displayScale !== null) ? this._displayScale : finalScale;
        // If the ball is essentially stationary and already treated as a goal/rest,
        // prevent `finalScale` from being smaller than the current displayed scale
        // so it won't slowly shrink after coming to rest.
        const isStationary = Math.abs(this._vx) < 0.25 && Math.abs(this._vy) < 0.25 && Math.abs(this._vz) < 0.25 && this._altitude <= 0.01;
        if (isStationary && isGoal && finalScale < dScale) {
            finalScale = dScale;
        }
        if (this._forceScaleFrames && this._forceScaleFrames > 0) {
            this._forceScaleFrames -= 1;
            this.ballSprite.scale.set(0.8 * dScale, 0.8 * dScale);
        } else {
            const delta = finalScale - dScale;
            const lerpFactor = delta > 0 ? 0.65 : 0.1;
            dScale += delta * lerpFactor;
            this._displayScale = dScale;
            this.ballSprite.scale.set(0.8 * dScale, 0.8 * dScale);
        }

        // Reduce rotation when stuck in net to avoid infinite spinning
        if (this._state === 'STUCK_IN_NET') {
            this.ballSprite.rotation += 0.02; // slow constant spin
        } else {
            this.ballSprite.rotation += this._vx * 0.05 + this._curveFactor * 0.2;
        }
        this.updateShadow(currentGroundVisualY, finalScale);
        
        // 4. Ground Check (bounce)
        if (this._altitude <= 0) {
            this._altitude = 0;
            if (this._pendingBarDown) this.resolveBarDown();

            if (Math.abs(this._vy) > 0.5) {
                this._vy = -this._vy * 0.8;
                this._vx *= 0.8;
                this._vz *= 1.2;
                this._state = 'BOUNCING_GROUND';
                try { if (this.onGroundHit) this.onGroundHit(this._z, this.x, this.y); } catch (e) {}
            } else {
                this._vy = 0.5;
                this._vx *= this.FRICTION; 
                this._vz *= this.FRICTION; 
            }
        }

        // Keeper interaction
        if (this.goalkeeper && this._z > this.GOAL_DISTANCE * 0.5 && this._vz > 0 && !this._ballUsed && !this._keeperCooldown && !this._ignoreGoalkeeper) {
            this.triggerGoalkeeper();
        }

        // End Condition
        const stopped = Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0;
        if (this._z > this.VANISHING_POINT_Z + 100 || stopped) {
            this.finishTurn();
        }

        // Emergency Reset
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this._z)) {
            this.emergencyReset();
        }

        // Smooth snap interpolation (if a snap target was set by collision handlers)
        try {
            if (this._snapLerpFrames > 0 && this._snapTargetX !== null && Number.isFinite(this._snapTargetX)) {
                const lerp = 0.25; // fraction per frame
                this.x += (this._snapTargetX - this.x) * lerp;
                this._snapLerpFrames -= 1;
                if (this._snapLerpFrames <= 0) {
                    this.x = this._snapTargetX;
                    this._snapTargetX = null;
                    this._snapLerpFrames = 0;
                }
            }
        } catch (e) {}

        try { this._prevX = this.x; this._prevY = this.y; } catch (e) {}
    }

    private preventRestOnPost(obj: any, incoming: number, inNet: boolean, side: 'left' | 'right'): boolean {
        try {
            // ----------------------------------------------------------------------
            // [IMPORTANT FIX]: Protect inside-goal region logic
            // If the ball has crossed the goal line and is between the two posts
            // then prevent this function from interfering. This function pushes the ball out (snap).
            // If allowed, it would teleport the ball to the center of the goal.
            // ----------------------------------------------------------------------
            if (this.goal && this._z >= this.GOAL_DISTANCE - 5) {
                // Get global coordinates of the inner edges of both posts
                const leftPostBounds = this.goal.leftPost.getBounds();
                const rightPostBounds = this.goal.rightPost.getBounds();
                
                // Right edge of the left post
                const innerLeft = leftPostBounds.x + leftPostBounds.width; 
                // Left edge of the right post
                const innerRight = rightPostBounds.x; 

                // Get current ball position (global)
                const ballPos = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));

                // If the ball lies between the two posts (+5px safety padding)
                if (ballPos.x > innerLeft + 5 && ballPos.x < innerRight - 5) {
                    return false; // STOP IMMEDIATELY
                }
            }
            // ----------------------------------------------------------------------

            // If the ball is already in the net, ignore outer post collisions
            if (inNet && this._vz > -5) {
                try { spawnImpactEffect(this.parent || this, this.x, this.y, { force: true }); } catch (e) { }
                try { this.debugCollision('POST_HIT_IN_NET', { side, x:this.x, y:this.y }); } catch(e){}
                try { this.handleGoal(); } catch (e) { }
                this._ignorePostCollisions = true;
                this._pushedOffByPost = false;
                return true;
            }

            try {
                const now = Date.now();
                // If we recently applied a post-related impulse, skip to avoid doubling forces
                if (now - this._postImpulseAppliedTime < this._postImpulseDebounceMs) return false;
                const bounds = obj.getBounds();
                const postCenterX = bounds.x + bounds.width / 2;
                
                const sign = (side === 'left') ? -1 : 1; 

                // 1. Compute bounce force: set to 60% of incoming impact as requested
                let bounceForce = incoming * 0.1;
                // keep a small minimum to avoid zero impulses
                bounceForce = Math.max(1, bounceForce);
                // Cap bounce force to avoid very large impulses from extreme inputs
                const maxBounceForce = 8; // tunable
                if (bounceForce > maxBounceForce) {
                    try { console.log('POST_SNAP: capping bounceForce', { incoming, original: incoming * 0.6, capped: maxBounceForce }); } catch(e) {}
                    bounceForce = maxBounceForce;
                }

                // 2. Compute new snap position - this caused issues before without the IMPORTANT fix above
                const pushOutDist = (bounds.width / 2 + (this.ballSprite.width / 2) * 0.2) + 2;
                    const newX = postCenterX + (Math.sign(this.x - postCenterX) || sign) * pushOutDist;

                if (Number.isFinite(newX)) {
                    this._snapTargetX = newX;
                    this._snapLerpFrames = 120;
                }

                spawnImpactEffect(this.parent || this, this.x, this.y);
                try { this.debugCollision('POST_SNAP', { side, newX, bounceForce, x:this.x, y:this.y }); } catch(e){}

                // 3. Update velocity — blend smoothly to avoid sudden large jumps
                try {
                    const oldVx = this._vx*0.2; const oldVz = this._vz*0.2; const oldVy = this._vy*0.2;
                    const targetVx = (Math.sign(this.x - postCenterX) || sign) * bounceForce;
                    const targetVz = Math.max(2, oldVz * 0.1);
                    const blendedVx = oldVx * 0.5 + targetVx * 0.5; // 50/50 blend
                    const blendedVz = oldVz * 0.5 + targetVz * 0.5;
                    const newVy = Math.max(2, Math.abs(oldVy) * 0.5);
                    console.log('POST_SNAP pre', { side, incoming, bounceForce, oldVx, oldVz, oldVy, targetVx, targetVz });
                    this._vx = blendedVx*0.3;
                    this._vz = blendedVz*0.3;
                    this._vy = newVy;
                    try { this._postImpulseAppliedTime = Date.now(); } catch(e) {}
                    try { console.log('POST_SNAP applied (blended)', { side, vx:this._vx, vz:this._vz, vy:this._vy, bounceForce }); } catch(e) {}
                } catch(e) {
                    // Fallback to previous safe behavior
                    this._vx = (Math.sign(this.x - postCenterX) || sign) * bounceForce;
                    this._vz *= 0.3;
                    this._vy = Math.max(2, Math.abs(this._vy) * 0.5);
                    try { this._postImpulseAppliedTime = Date.now(); } catch(e) {}
                }

                this._altitude = Math.max(this._altitude, 6);
                this._lastPostCollisionTime = Date.now();
                this._pushedOffByPost = true;

                return true;
            } catch (e) { return false; }
        } catch (e) { return false; }
    }

    private checkPostCollisions(): boolean {
        // If already hit the inner guide, skip
        if (this._ignorePostCollisions) return false;
        
        // If there's no goal
        if (!this.goal) return false;

        // [FIX 1]: IF BALL IS SIGNIFICANTLY ABOVE THE CROSSBAR -> SKIP COLLISIONS
        // Add 10 units margin for the ball radius; otherwise it's considered to pass over
        if (this._altitude > this.MAX_GOAL_HEIGHT + 10) return false;

        const r = (this.ballSprite.width / 2) * 0.8; 
        const now = Date.now();
        if (now - this._lastPostCollisionTime < 500) return false;
        
        const impactSpeed = Math.abs(this._vx) + 2;
        const impactSpeed2 = 0.6*Math.abs(this._vz) + 2;

        const converter = this.parent || this;
        const currGlobal = converter.toGlobal(new PIXI.Point(this.x, this.y));

        // Helper: 2D collision check
        const checkHit = (obj: any) => {
            if (!obj) return false;
            try {
                const bounds = obj.getBounds();
                // Simple AABB collision check expanded by radius r
                const dx = currGlobal.x - (bounds.x + bounds.width/2);
                const dy = currGlobal.y - (bounds.y + bounds.height/2);
                return (Math.abs(dx) < bounds.width/2 + r && Math.abs(dy) < bounds.height/2 + r);
            } catch(e) { return false; }
        };

        // --- CLASSIFY COLLISIONS BY ALTITUDE ---

        // 1. Crossbar check
        // Condition: ball must be near crossbar height
        // (e.g. within top ~85% of the goal area to count as a bar hit)
        const isHighEnoughForBar = this._altitude > this.MAX_GOAL_HEIGHT - 25;

        // screen-space overlap fallback: if ball's global Y overlaps the crossbar bounds
        // when near the goal Z, treat it as a candidate for bar collision (helps fast shots)
        let screenOverlapForBar = false;
        try {
            const barB = this.goal.crossbar.getBounds();
            const ballGForBar = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
            const dyBar = Math.abs(ballGForBar.y - (barB.y + barB.height / 2));
            screenOverlapForBar = dyBar < (barB.height / 2 + r);
        } catch (e) { screenOverlapForBar = false; }

        if ((isHighEnoughForBar || (this._z >= this.GOAL_DISTANCE - 20 && screenOverlapForBar)) && checkHit(this.goal.crossbar)) {
             const falling = this._vy < 0 || this._vz > 0;
             if (falling) {
                 spawnImpactEffect(this.parent || this, this.x, this.y);
                try { this.debugCollision('CROSSBAR_HIT', { x: this.x, y: this.y, vz: this._vz, vy: this._vy }); } catch(e){}
                 // Improve crossbar bounce: reduce sideways deflection and push the ball
                 // backward (toward the player) so it doesn't diagonally continue into the goal.
                 try {
                     // Deflect inward toward goal center (instead of pushing back to player)
                     const converter = this.parent || this;
                     const ballG = converter.toGlobal(new PIXI.Point(this.x, this.y));
                     try {
                         const gb = this.goal.goalSprite.getBounds();
                         const goalCenterX = gb.x + gb.width / 2;
                         const deltaX = goalCenterX - ballG.x;
                         // Compute a stronger push magnitude based on how far from center the hit occurred
                         const pushMag = Math.max(12, Math.min(40, Math.abs(deltaX) * 0.2 + Math.abs(this._vz) * 0.3));
                         // Force direction explicitly: positive vx moves right on screen
                         const dir = deltaX >= 0 ? 1 : -1;
                         this._vx = dir * pushMag;
                         if (this._debugLogs) {
                             const titleStyle = 'color: #7B3FE4; font-weight:700; background: #fffbe6; padding:2px 6px; border-radius:4px;';
                             try {
                                 console.groupCollapsed('%c CROSSBAR DEFLECT', titleStyle);
                                 console.log('ballGX:', ballG.x, 'goalCenterX:', goalCenterX, 'deltaX:', deltaX);
                                 console.log('pushMag:', pushMag, 'vx:', this._vx, 'vzBefore:', this._vz);
                                 console.groupEnd();
                             } catch (e) {
                                 console.log('CROSSBAR DEFLECT', { ballGX: ballG.x, goalCenterX, deltaX, pushMag, vx: this._vx, vzBefore: this._vz });
                             }
                         }
                     } catch (e) {
                        // Fallback: if goal sprite not available, nudge toward center based on sign of current vx
                        try {
                            const oldVx = this._vx; const oldVz = this._vz; const oldVy = this._vy;
                            console.log('CROSSBAR pre (fallback)', { oldVx, oldVz, oldVy });
                        } catch(e) {}
                        this._vx = (Math.sign(this._vx) || 1) * Math.max(6, Math.abs(this._vx) * 0.5);
                    }
                    // Keep some forward momentum so the ball trends into the goal area
                    try { const oldVz = this._vz; console.log('CROSSBAR pre vz', { oldVz }); } catch(e) {}
                    this._vz = Math.max(8, Math.abs(this._vz) * 0.8);
                    // Slight upward bounce then drop so it falls into the net area
                    try { const oldVy = this._vy; console.log('CROSSBAR pre vy', { oldVy }); } catch(e) {}
                    this._vy = -Math.abs(this._vy) * 0.5 + 2;
                    try { console.log('CROSSBAR applied', { vx:this._vx, vz:this._vz, vy:this._vy }); } catch(e) {}
                 } catch (e) {}

                 this._pendingBarDown = true;
                 this._lastPostCollisionTime = now;
                 return true;
             }
        }
        
        // [FIX 2]: CHECK VERTICAL POSTS (Left/Right)
        // Condition: ball must be lower than the crossbar to strike the post body.
        // If the ball is at crossbar height, it will hit the bar (handled above) or pass over.
        const isLowEnoughForPost = this._altitude < this.MAX_GOAL_HEIGHT - 5;

        if (isLowEnoughForPost) {
            // If the ball is between the inner edges of the two posts then DO NOT call preventRestOnPost
            let insidePosts = false;
            try {
                if (this.goal && this.goal.leftPost && this.goal.rightPost) {
                    const leftB = this.goal.leftPost.getBounds();
                    const rightB = this.goal.rightPost.getBounds();
                    const innerLeft = leftB.x + leftB.width;
                    const innerRight = rightB.x;
                    const ballG = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                    const padding = 10;
                    if (ballG.x > innerLeft + padding && ballG.x < innerRight - padding) {
                        insidePosts = true;
                    }
                }
            } catch (e) { insidePosts = false; }

            // Left Post
                if (!insidePosts && checkHit(this.goal.leftPost)) { 
                try { this.debugCollision('POST_HIT', { side: 'left', impactSpeed2, x: this.x, y: this.y }); } catch(e){}
                this.preventRestOnPost(this.goal.leftPost, impactSpeed2, false, 'left'); 
                return true; 
            }
            
            // Right Post
            if (!insidePosts && checkHit(this.goal.rightPost)) { 
                try { this.debugCollision('POST_HIT', { side: 'right', impactSpeed2, x: this.x, y: this.y }); } catch(e){}
                this.preventRestOnPost(this.goal.rightPost, impactSpeed2, false, 'right'); 
                return true; 
            }
        }

        return false;
    }

    private checkGameCollisions() {
        if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
            if (this._altitude < this.MAX_GOAL_HEIGHT) {
                this._potentialGoal = true;
            }
        }
    }

    private checkNetContact() {
        // ... (keep existing net contact logic)
        if (this._netContacted) return;
        if (!this.goal || !this.goal.netSprite) return;
        if (this._z < this.GOAL_DISTANCE - 20) return;
        if (this._altitude > this.MAX_GOAL_HEIGHT) return;

        // Simple distance check to net center (Visual Approx)
        const netBounds = this.goal.netSprite.getBounds();
        const centerNet = { x: netBounds.x + netBounds.width/2, y: netBounds.y + netBounds.height/2 };
        const ballG = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
        const dy = ballG.y - centerNet.y;
        const dx = ballG.x - centerNet.x;
        
        // If the ball is within the net area
          if (Math.abs(dx) < netBounds.width/2 - 10 && Math.abs(dy) < netBounds.height/2 - 10) {
             this._netContacted = true;
             this._vz = 0.5;
             this._vx *= 0.1;
             this._vy = -3;
             this._state = 'STUCK_IN_NET';
                     spawnImpactEffect(this.parent || this, this.x, this.y, { force: true });
                 try { this.debugCollision('NET_CONTACT', { ballG, netBounds }); } catch(e){}
                 try { this.setBelowKeeper(); } catch (e) {}
        }
    }

    private handleGoal() {
        if (this._goalPending) return;
        this._goalPending = true;
        this._targetZ = Math.min(this._z, this.GOAL_DISTANCE);
        this._vz = Math.min(this._vz, 3);
        this._vx *= 0.2;
        this._vy = -6;
        this._isMoving = true;
        try { this.debugCollision('GOAL_PENDING', { x:this.x, y:this.y, z:this._z }); } catch(e){}
    }

    private triggerGoalkeeper() {
        if (this._keeperRequestInFlight) return;
        this._keeperRequestInFlight = true;
        let zone = null;
        try {
            if (this.goal && typeof this.goal.getZoneFromPosition === 'function') {
                zone = this.goal.getZoneFromPosition(this.x, this.y);
            }
        } catch (e) { zone = null; }

        if (!this.goalkeeper || typeof this.goalkeeper.attemptCatch !== 'function') {
            this._keeperRequestInFlight = false;
            return;
        }

        this.goalkeeper.attemptCatch(this.x, this.y, zone, 20).then((res:any) => {
             if (res.caught) {
                 this._savedPending = true;
                 this._vx = (Math.random()-0.5)*40;
                 this._vz = -20;
                 this._vy = 20;
                 this._keeperCooldown = true;
                 setTimeout(() => this._keeperCooldown = false, 1000);
             }
             this._keeperRequestInFlight = false;
        });
    }

    private resolveBarDown() {
        if (this._z >= this.GOAL_DISTANCE) {
             this.handleGoal();
        } else {
             this._pushedOffByPost = true;
        }
        this._pendingBarDown = false;
    }

    private finishTurn() {
        if (!this._isMoving) return;
        this._isMoving = false;
        
        if (this._savedPending) {
            this._savedPending = false;
            try { if (this.saveCallback) this.saveCallback(); } catch(e){}
            return;
        }
        if (this._goalPending || this._goalConfirmed || this._netContacted) {
            this._goalScored = true;
            try { if (this.goalScoredCallback) this.goalScoredCallback(null); } catch(e){}
            return;
        }
        if (this.outCallback) this.outCallback();
        if (this.onBallDestroyed) setTimeout(this.onBallDestroyed, 1000);
    }

    private emergencyReset() {
        this.x = BASE_WIDTH / 2;
        this.y = (BASE_HEIGHT * 3) / 4;
        this._z = 0; this._vx = 0; this._vy = 0; this._vz = 0;
        this.finishTurn();
    }

    private computeFinalScaleForY(worldY: number, screenHeight?: number): number {
        const sh = screenHeight || BASE_HEIGHT;
        const yNorm = Math.max(0, Math.min(1, worldY / sh));
        return this._baseScale * (0.6 + (1.4 - 0.6) * Math.pow(yNorm, 1.5));
    }

    private updateShadow(groundY: number, scale: number) {
        if (!this.shadowSprite) return;
        this.shadowSprite.clear();
        this.shadowSprite.beginFill(0x000000, 0.3 * Math.max(0, 1 - (this._altitude / 300)));
        this.shadowSprite.drawEllipse(0, 0, 20 * scale * Math.max(0.5, 1 - (this._altitude / 200)), 10 * scale);
        this.shadowSprite.endFill();
        this.shadowSprite.position.set(0, this._altitude + 15 * scale); 
    }

    private checkInnerBarCollision(prevZ: number, currZ: number) {
        if (!this.goal) return;

        // 1. Only check when the ball has just passed the goal line
        if (currZ < this.GOAL_DISTANCE) return;
        if (currZ > this.GOAL_DISTANCE + 50) return;
        if (this._altitude > this.MAX_GOAL_HEIGHT) return;

        // Throttle inner-guide collisions to avoid repeated triggers
        try {
            const now = Date.now();
            if (now - this._lastPostCollisionTime < 500) return;
        } catch (e) {}

        const checkHit = (obj: PIXI.Graphics | null | undefined) => {
            if (!obj) return null;
            try {
                const b = obj.getBounds();
                const ballPos = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                
                // Keep small padding for hit accuracy
                const padding = 8; 

                const isHitX = ballPos.x > b.x - padding && ballPos.x < b.x + b.width + padding;
                const isHitY = ballPos.y > b.y - padding && ballPos.y < b.y + b.height + padding;

                return (isHitX && isHitY) ? b : null;
            } catch (e) { return null; }
        };

        // --- HANDLE COLLISIONS (soft bounce tuned) ---

        const hitLeft = checkHit(this.goal.frontLeftVis);
        const hitRight = checkHit(this.goal.frontRightVis);
        // const hitLeftHor = checkHit(this.goal.frontLeftHorVis); // disabled
        // const hitRightHor = checkHit(this.goal.frontRightHorVis); // disabled

        if (hitLeft || hitRight) {
            this._z = this.GOAL_DISTANCE; 
            
            
            // [IMPORTANT FIX]: Set this flag so checkPostCollisions below doesn't run
            // Prevent it from snapping the ball elsewhere
            this._ignorePostCollisions = true; 
            // Internal bounce physics (keep soft bounce behavior)
            this._vx = Math.abs(this._vx) * 0.2;
            this._vz = Math.max(2, this._vz * 0.4);
            this._vy = -Math.abs(this._vy * 0.5);

            // mark as net contact / stuck
            this._state = 'STUCK_IN_NET';
            this._netContacted = true;

            try {
                const converter = this.parent || this;
                const ballG = converter.toGlobal(new PIXI.Point(this.x, this.y));

                let desiredGlobalX = null as number | null;
                let rotationDelta = 0.5;

                if (hitLeft) {
                    const h = hitLeft as any;
                    desiredGlobalX = h.x + h.width + 18;
                    rotationDelta = 0.5;
                    try { this.debugCollision('INNER_HIT', { side: 'left', hit: h, ballG, desiredGlobalX }); } catch(e) {}
                } else if (hitRight  ) {
                    const h = hitRight as any;
                    desiredGlobalX = h.x - 18;
                    rotationDelta = -0.5;
                    try { this.debugCollision('INNER_HIT', { side: 'right', hit: h, ballG, desiredGlobalX }); } catch(e) {}
                }

                if (desiredGlobalX !== null) {
                    const desiredLocal = converter.toLocal(new PIXI.Point(desiredGlobalX, ballG.y));
                    // Give the ball a small inward lateral push toward the snap target
                    const lateralDir = Math.sign(desiredLocal.x - this.x) || 1;
                    // soft lateral nudges and forward momentum so it will bounce when hitting ground
                    try {
                        // Do NOT apply full lateral + forward push immediately.
                        // Only set a small nudged lateral velocity (20% toward target) and
                        // set the snap target so the lerp will pull the ball into place.
                        const oldVx = this._vx; const oldVz = this._vz; const oldVy = this._vy;
                        const targetVx = lateralDir * (Math.max(4, Math.abs(oldVx) * 0.25 + 3));
                        const nudgedVx = oldVx * 0.8 + targetVx * 0.2; // 20% nudged toward target
                        console.log('INNER_HIT pre', { side: hitLeft ? 'left' : 'right', oldVx, oldVz, oldVy, lateralDir, desiredGlobalX });
                        this._vx = nudgedVx;
                        // do not modify _vz/_vy here to avoid large forward impulses
                        this._pendingBarDown = true; // ensure resolveBarDown runs on ground contact
                        console.log('INNER_HIT applied (nudged)', { nudgedVx });
                    } catch (e) {
                        const oldVx = this._vx; const oldVz = this._vz; const oldVy = this._vy;
                        const fallbackVx = lateralDir * 6;
                        this._vx = oldVx * 0.8 + fallbackVx * 0.2;
                        // keep existing vz/vy
                        this._pendingBarDown = true;
                        console.log('INNER_HIT fallback applied (nudged)', { oldVx, oldVz, oldVy, vx: this._vx });
                    }
                    try { this._postImpulseAppliedTime = Date.now(); } catch(e) {}
                    this._snapTargetX = desiredLocal.x;
                    this._snapLerpFrames = 12;
                    this.ballSprite.rotation += rotationDelta;
                    spawnImpactEffect(this.parent || this, this.x, this.y, { force: true });
                    try { this._lastPostCollisionTime = Date.now(); } catch(e) {}
                }
            } catch (e) { try { console.warn('inner snap failed', e); } catch(_) {} }
            return;
        }
    }
    private setAboveKeeper() {
        try {
            if (this.parent && this.goalkeeper) {
                const idx = this.parent.getChildIndex(this.goalkeeper);
                // Set ball index = keeper index + 1
                this.parent.setChildIndex(this, Math.min(this.parent.children.length - 1, idx + 1));
            }
        } catch (e) {}
    }

    // Place the ball BELOW the keeper (when ball rolls into the net)
    private setBelowKeeper() {
        try {
            if (this.parent && this.goalkeeper) {
                const idx = this.parent.getChildIndex(this.goalkeeper);
                // Set ball index = keeper index - 1
                this.parent.setChildIndex(this, Math.max(0, idx - 1));
            }
        } catch (e) {}
    }

    // Themed collision logger for consistent debug output
    private debugCollision(type: string, info?: any) {
        if (!this._debugLogs) return;
        try {
            const titleStyle = 'color: #ffffff; font-weight:700; background: linear-gradient(90deg,#6a11cb,#2575fc); padding:2px 6px; border-radius:4px;';
            console.groupCollapsed(`%c COLLISION: ${type}`, titleStyle);
            try { console.log(info); } catch (e) { console.log(type, info); }
            console.groupEnd();
        } catch (e) { try { console.log('COLLISION', type, info); } catch (_) {} }
    }
    
    // API Public
    public getVisualScale() { return 0.8 * (this._displayScale || this._baseScale); }
    public checkAndLogScale(e:string) {}
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