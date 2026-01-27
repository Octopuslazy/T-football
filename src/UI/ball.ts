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
    private readonly GRAVITY = 0.9;
    private readonly FRICTION = 0.96; // Tăng ma sát lên xíu để bóng bay đầm hơn
    private readonly FALLBACK_MAX_GOAL_HEIGHT = 140;
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
    private _debugLogs: boolean = true; // Bật log để debug
    
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
    private _ignoreGoalkeeper: boolean = false; 
    private _goalPending: boolean = false; 
    private _savedPending: boolean = false; 
    private _netContacted: boolean = false; 
    private _lastNetContactTime: number | null = null;
    private _lastNetContactZ: number | null = null;

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
    private _baseScale = 0.6;
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
        if (distSq > 25) { 
            this._dragPath.push({ x: p.x, y: p.y });
        }
    };

    // [FIXED] Hàm PointerUp đã được sửa lỗi logic thứ tự và lực sút
    private _onPointerUp = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (!this._isCharging) return;
        this._isCharging = false;

        const now = performance.now();
        const duration = now - this._chargeStartTime;
        
        // [QUAN TRỌNG]: Luôn thêm điểm cuối vào mảng TRƯỚC KHI kiểm tra
        const endPos = e.data.global;
        if (!this._dragPath) this._dragPath = [];
        this._dragPath.push({ x: endPos.x, y: endPos.y });

        // Tạo dữ liệu giả nếu mảng thiếu điểm (tránh lỗi logic)
        if (this._dragPath.length < 2) {
             const p = {x: endPos.x, y: endPos.y};
             this._dragPath = [p, {x: p.x, y: p.y - 10}];
        }

        const startPos = this._dragPath[0];
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y; 
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Nếu vuốt quá ngắn (<10px) thì bỏ qua
        if (dist < 10) return;

        // --- TÍNH TOÁN LỰC ---
        const screenW = window.innerWidth || BASE_WIDTH;
        const screenH = window.innerHeight || BASE_HEIGHT;

        const distPercent = dist / screenH;
        const dxPercent = dx / screenW;
        const dyPercent = dy / screenH;

        let speed = (distPercent / Math.max(duration, 140)) * 20000; 
        // Tốc độ tối thiểu 24 để thắng ma sát
        speed = Math.max(5, Math.min(speed, 40));

        this._curveFactor = this.calculateCurveFactor(startPos, endPos, this._dragPath);
        this._vx = dxPercent * 80 + this._curveFactor * 10;
        this._vy = Math.max(6, Math.abs(dyPercent) * 34); 
        this._vz = speed;

        // Reset trạng thái
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

        // Debug Log Position (Để kiểm tra bóng có bay không)
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

        // 2. Perspective Calculation
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

        // 3. Layering
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
        this.checkInnerBarCollision();
        try { this.checkNetContact(); } catch (e) {}

        // 3. Layering
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

        // 4. Scale
        let finalScale = typeof (this as any).finalScaleNow !== 'undefined' ? (this as any).finalScaleNow : this.computeFinalScaleForY((this.parent||this).toGlobal(new PIXI.Point(this.x, this.y)).y);
        
        let vanishingAlpha = 1.0;
        let vanishingScaleFactor = 1.0;

        // Xác định bóng có phải là bàn thắng không
        const isGoal = this._netContacted || 
                       this._goalPending || 
                       this._goalConfirmed || 
                       this._state === 'STUCK_IN_NET' || 
                       this._goalScored ||
                       (this.goal && this.goal.isInGoalArea(this.x, this.y) && this._altitude < this.MAX_GOAL_HEIGHT);

        // [QUAN TRỌNG]: Nếu bóng đã qua vạch vôi VÀ KHÔNG PHẢI bàn thắng
        // thì áp dụng hiệu ứng biến mất, BẤT KỂ ĐỘ CAO (Altitude/Y) là bao nhiêu.
        if (this._z > this.GOAL_DISTANCE && !isGoal) {
            const totalVanishingDist = this.VANISHING_POINT_Z - this.GOAL_DISTANCE;
            const distPastGoal = this._z - this.GOAL_DISTANCE;
            
            // Tỷ lệ biến mất (0 -> 1)
            const vanishingRatio = Math.min(1, Math.max(0, distPastGoal / totalVanishingDist));
            
            // Mờ dần (Dùng mũ 1.2 để mờ nhanh hơn ở đoạn đầu)
            vanishingAlpha = 1.0 - Math.pow(vanishingRatio, 1.2);
            // Nhỏ dần thêm
            vanishingScaleFactor = 1.0 - (vanishingRatio * 0.7);

            // Nếu mờ hẳn thì kết thúc
            if (vanishingAlpha <= 0.02) {
                this.ballSprite.alpha = 0;
                this.finishTurn();
                return; 
            }
        } else {
            vanishingAlpha = 1.0;
            vanishingScaleFactor = 1.0;
        }

        this.ballSprite.alpha = vanishingAlpha;
        if (this.shadowSprite) this.shadowSprite.alpha = vanishingAlpha * 0.3;

        // Scale cơ bản theo Z (Perspective)
        if (this._z > this.GOAL_DISTANCE) {
            const zBasedFactor = 0.55 * (600 / Math.max(600, this._z));
            const zScale = this._baseScale * zBasedFactor;
            finalScale = Math.min(finalScale, zScale);
        }

        // Nhân thêm scale biến mất
        finalScale *= vanishingScaleFactor;

        let dScale: number = (this._displayScale !== null) ? this._displayScale : finalScale;
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

        this.ballSprite.rotation += this._vx * 0.05 + this._curveFactor * 0.2;
        this.updateShadow(currentGroundVisualY, finalScale);
        
        // 5. Collisions
        try { this.checkNetContact(); } catch (e) {}
        

        if (this._altitude <= 0) {
            this._altitude = 0;
            if (this._pendingBarDown) this.resolveBarDown();

            if (Math.abs(this._vy) > 0.5) {
                this._vy = -this._vy * 0.5;
                this._vx *= 0.8;
                this._vz *= 0.8;
                this._state = 'BOUNCING_GROUND';
                try { if (this.onGroundHit) this.onGroundHit(this._z, this.x, this.y); } catch (e) {}
            } else {
                this._vy = 0;
                this._vx *= this.FRICTION; 
                this._vz *= this.FRICTION; 
            }
        }

        if (this._z >= this.GOAL_DISTANCE) {
            if (this.checkPostCollisions()) return;
            if (!this._ballUsed) this.checkGameCollisions();
        }

        if (this.goalkeeper && this._z > this.GOAL_DISTANCE * 0.5 && this._vz > 0 && !this._ballUsed && !this._keeperCooldown && !this._ignoreGoalkeeper) {
            this.triggerGoalkeeper();
        }

        const stopped = Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0;
        if (this._z > 1500 || stopped) {
            this.finishTurn();
        }

        if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this._z)) {
            this.emergencyReset();
        }

        try { this._prevX = this.x; this._prevY = this.y; } catch (e) {}
    }

    private preventRestOnPost(obj: any, incoming: number, inNet: boolean, side: 'left' | 'right'): boolean {
        // ... (Logic giữ nguyên)
        try {
            if (inNet && this._vz > -5) {
                try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch (e) { }
                try { this.handleGoal(); } catch (e) { }
                this._ignorePostCollisions = true;
                this._pushedOffByPost = false;
                return true;
            }
            try {
                const bounds = obj.getBounds();
                const postCenterX = bounds.x + bounds.width / 2;
                const sign = Math.sign(this.x - postCenterX) || 1;
                const nudge = Math.max(6, Math.min(28, incoming * 0.5 + 6));
                const newX = postCenterX + sign * (bounds.width / 2 + (this.ballSprite.width / 2) * 0.8 + 8);
                if (Number.isFinite(newX)) this.x = newX;
                else this.x += (sign > 0 ? 25 : -25);
                spawnImpactEffect(this.parent || this, this.x, this.y);
                this._vx = sign * nudge;
                this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
                this._vy = Math.max(2, Math.abs(this._vy) * 0.25 + nudge * 0.04);
                this._altitude = Math.max(this._altitude, 6);
                this._lastPostCollisionTime = Date.now();
                this._pushedOffByPost = true;
                return true;
            } catch (e) { return false; }
        } catch (e) { return false; }
    }

    private checkPostCollisions(): boolean {
        // ... (Logic giữ nguyên)
        if (this._ignorePostCollisions) return false;
        if (!this.goal) return false;
        if (this._altitude > this.MAX_GOAL_HEIGHT * 1.1) return false;
        try { if (this.goal && !this.goal.isInGoalArea(this.x, this.y)) return false; } catch (e) {}

        const r = (this.ballSprite.width / 2) * 0.8; 
        const now = Date.now();
        if (now - this._lastPostCollisionTime < 300) return false;

        const converter = this.parent || this;
        const prevGlobal = converter.toGlobal(new PIXI.Point(this._prevX, this._prevY));
        const currGlobal = converter.toGlobal(new PIXI.Point(this.x, this.y));

        // Simplified Helpers
        const checkHit = (obj: any) => {
            if (!obj) return false;
            try {
                const bounds = obj.getBounds();
                const dx = currGlobal.x - (bounds.x + bounds.width/2);
                const dy = currGlobal.y - (bounds.y + bounds.height/2);
                // Simple circle-rect approx
                return (Math.abs(dx) < bounds.width/2 + r && Math.abs(dy) < bounds.height/2 + r);
            } catch(e) { return false; }
        };

        if (checkHit(this.goal.crossbar)) {
             // ... Handle Crossbar (Giữ nguyên logic cũ nếu muốn, hoặc rút gọn)
             const falling = this._vy < 0 || this._vz > 0;
             if (falling) {
                 spawnImpactEffect(this.parent || this, this.x, this.y);
                 this._vy = -Math.abs(this._vy) - 5;
                 this._pendingBarDown = true;
                 this._lastPostCollisionTime = now;
                 return true;
             }
        }
        if (checkHit(this.goal.leftPost)) { this.preventRestOnPost(this.goal.leftPost, 20, false, 'left'); return true; }
        if (checkHit(this.goal.rightPost)) { this.preventRestOnPost(this.goal.rightPost, 20, false, 'right'); return true; }
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
        // ... (Giữ nguyên logic chạm lưới)
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
        
        // Nếu bóng nằm trong vùng lưới
        if (Math.abs(dx) < netBounds.width/2 - 10 && Math.abs(dy) < netBounds.height/2 - 10) {
             this._netContacted = true;
             this._vz = 0.5;
             this._vx *= 0.1;
             this._vy = -3;
             this._state = 'STUCK_IN_NET';
             spawnImpactEffect(this.parent || this, this.x, this.y);
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
    }

    private triggerGoalkeeper() {
        if (this._keeperRequestInFlight) return;
        this._keeperRequestInFlight = true;
        let zone = null;
        try { if(this.goal) zone = this.goal.getZoneFromPosition(this.x, this.y); } catch(e){}
        this.goalkeeper.attemptCatch(this.x, this.y, zone, 20).then((res:any) => {
             if (res.caught) {
                 this._savedPending = true;
                 this._vx = (Math.random()-0.5)*30;
                 this._vz = -20;
                 this._vy = 10;
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
        return this._baseScale * (0.4 + (1.4 - 0.4) * Math.pow(yNorm, 1.5));
    }

    private updateShadow(groundY: number, scale: number) {
        if (!this.shadowSprite) return;
        this.shadowSprite.clear();
        this.shadowSprite.beginFill(0x000000, 0.3 * Math.max(0, 1 - (this._altitude / 300)));
        this.shadowSprite.drawEllipse(0, 0, 20 * scale * Math.max(0.5, 1 - (this._altitude / 200)), 10 * scale);
        this.shadowSprite.endFill();
        this.shadowSprite.position.set(0, this._altitude + 15 * scale); 
    }

    private checkInnerBarCollision() {
        if (!this.goal || !this.goal.frontLeftVis || !this.goal.frontRightVis) return;
        
        // 1. Chỉ check khi bóng đã qua vạch vôi
        if (this._z < this.GOAL_DISTANCE + 10) return;
        
        // 2. Nếu bóng bay quá xa (đã tan biến) thì thôi
        if (this._z > 900) return;

        // 3. Nếu bóng bay cao hơn xà ngang thì thôi
        if (this._altitude > this.MAX_GOAL_HEIGHT) return;

        const checkHit = (obj: PIXI.Graphics) => {
            if (!obj || !obj.visible) return false;
            try {
                const b = obj.getBounds();
                
                // Lấy vị trí bóng hiện tại (Global)
                const ballPos = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                
                // [QUAN TRỌNG] Dùng bán kính cố định để check thay vì getBounds() của Sprite
                // Lý do: Sprite có thể bị scale nhỏ xíu do hiệu ứng vanishing, làm hỏng va chạm.
                // Ta giả định bán kính vật lý của bóng khoảng 15-20px trên màn hình.
                const ballRadius = 20; 

                // Kiểm tra va chạm hình chữ nhật (AABB) với hình tròn
                const closestX = Math.max(b.x, Math.min(ballPos.x, b.x + b.width));
                const closestY = Math.max(b.y, Math.min(ballPos.y, b.y + b.height));
                
                const dx = ballPos.x - closestX;
                const dy = ballPos.y - closestY;
                
                return (dx * dx + dy * dy) < (ballRadius * ballRadius);
            } catch (e) { return false; }
        };

        // A. Chạm thanh TRÁI
        if (checkHit(this.goal.frontLeftVis)) {
            this._vx = 9.5; 
            this._vy = -6.0; 
            this._vz *= 0.1; 
            this.ballSprite.rotation += 0.5;
            
            // Đánh dấu va chạm ĐỂ NGĂN CHẶN BÓNG BIẾN MẤT
            this._state = 'STUCK_IN_NET'; 
            this._netContacted = true;
            
            try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch(e){}
        }
        // B. Chạm thanh PHẢI
        else if (checkHit(this.goal.frontRightVis)) {
            this._vx = -9.5; 
            this._vy = -6.0; 
            this._vz *= 0.1; 
            this.ballSprite.rotation -= 0.5;
            
            this._state = 'STUCK_IN_NET'; 
            this._netContacted = true;
            
            try { spawnImpactEffect(this.parent || this, this.x, this.y); } catch(e){}
        }
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