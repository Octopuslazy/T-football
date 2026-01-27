import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { soundController } from '../ControllUI/SoundController';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Ball extends PIXI.Container {
    // --- Visuals ---
    private ballSprite!: PIXI.Sprite;
    private shadowSprite!: PIXI.Graphics;
    // REMOVED: _previewGraphics (Không dùng vẽ đường swipe nữa)

    // --- Physics & State ---
    private _velocity = { x: 0, y: 0 }; 
    // 3D Physics Properties
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
    private readonly GRAVITY = 0.9;
    private readonly FRICTION = 0.95;
    private readonly GROUND_Y_OFFSET = 100; 
    private readonly MAX_GOAL_HEIGHT = 140;

    // Physics Helpers
    private vecLen3 = (x:number,y:number,z:number) => Math.sqrt(x*x + y*y + z*z);
    private normalize3 = (x:number,y:number,z:number) => {
        const l = Math.sqrt(x*x + y*y + z*z) || 1e-6; return { x: x/l, y: y/l, z: z/l };
    }
    private dot3 = (ax:number,ay:number,az:number, bx:number,by:number,bz:number) => ax*bx + ay*by + az*bz;
    private reflectVec3 = (vx:number,vy:number,vz:number, nx:number,ny:number,nz:number, restitution:number) => {
        const dot = this.dot3(vx,vy,vz, nx,ny,nz);
        const rx = vx - 2 * dot * nx;
        const ry = vy - 2 * dot * ny;
        const rz = vz - 2 * dot * nz;
        return { x: rx * restitution, y: ry * restitution, z: rz * restitution };
    };

    private _isMoving = false;
    private _debugLogs: boolean = false;
    
    // CHANGED: Input variables for "Swipe & Curve" mechanic
    private _isCharging = false;     // Đang vuốt
    private _chargeStartTime = 0;    // Thời điểm bắt đầu vuốt
    // ADDED: Lưu lại quỹ đạo vuốt để tính độ xoáy
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

    // Constants for Collision Tuning
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
    private _debugOverlayTimeout: any = null;

    private onEnterFrame!: () => void;
    private _baseScale = 0.6;
    private _groundLevelY = 0;
    
    constructor(gameState?: { ballsRemaining: number; gameOver: boolean }, goal?: any, goalkeeper?: any) {
        super();
        if (gameState) this.gameState = gameState;
        this.goal = goal;
        this.goalkeeper = goalkeeper;

        this.createVisuals();

        this.interactive = true;
        this.cursor = 'pointer';

        this.on('pointerdown', this._onPointerDown);
        // ADDED: Cần pointermove để ghi lại quỹ đạo cong
        this.on('pointermove', this._onPointerMove);
        this.on('pointerup', this._onPointerUp);
        this.on('pointerupoutside', this._onPointerUp);

        // Global listeners
        this._globalPointerDown = (ev: PointerEvent) => {
            try {
                if (this._isMoving || this._ballUsed) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerDown({ data: p });
            } catch (e) { console.warn('ball.ts global down', e); }
        };
        // ADDED: Global move
        this._globalPointerMove = (ev: PointerEvent) => {
            try {
                if (!this._isCharging) return;
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerMove({ data: p });
            } catch (e) { console.warn('ball.ts global move', e); }
        };
        this._globalPointerUp = (ev: PointerEvent) => {
            try {
                if (!this._isCharging) return; 
                const p = { global: new PIXI.Point(ev.clientX, ev.clientY) } as any;
                this._onPointerUp({ data: p });
            } catch (e) { console.warn('ball.ts global up', e); }
        };
        
        window.addEventListener('pointerdown', this._globalPointerDown);
        // ADDED: Global move listener
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
            // Texture Pattern
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
            this.interactive = true; 
        } catch (e) {}

        // REMOVED: _previewGraphics initialization
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

    public setScale(factor: number) {
        if (!factor || factor <= 0) return;
        this._baseScale = factor;
        if (this.ballSprite && this.ballSprite.texture) {
            this.ballSprite.scale.set(this._baseScale, this._baseScale);
        }
        this.updateShadow(this._groundLevelY || (BASE_HEIGHT * 3) / 4, this._baseScale);
    }

    // --- NEW INPUT HANDLING (Swipe with Curve) ---

    private _onPointerDown = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (this._isMoving || this._ballUsed) return;
        
        this._isCharging = true;
        this._chargeStartTime = performance.now();
        
        // ADDED: Bắt đầu ghi lại đường dẫn mới
        const p = e.data.global;
        this._dragPath = [{ x: p.x, y: p.y }];
    };

    // ADDED: Ghi lại các điểm trung gian khi vuốt
    private _onPointerMove = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (!this._isCharging) return;
        const p = e.data.global;
        // Chỉ thêm điểm mới nếu nó cách điểm cũ một khoảng nhất định để tránh quá nhiều dữ liệu
        const last = this._dragPath[this._dragPath.length - 1];
        const distSq = (p.x - last.x)*(p.x - last.x) + (p.y - last.y)*(p.y - last.y);
        if (distSq > 25) { // Cách nhau > 5px
            this._dragPath.push({ x: p.x, y: p.y });
        }
    };

    // Global Handlers
    private _globalPointerDown!: (e: PointerEvent) => void;
    // ADDED:
    private _globalPointerMove!: (e: PointerEvent) => void;
    private _globalPointerUp!: (e: PointerEvent) => void;

    private _onPointerUp = (e: any) => {
        try { if ((window as any).__gameInputLocked) return; } catch (e) {}
        if (!this._isCharging) return;
        this._isCharging = false;

        const now = performance.now();
        const duration = now - this._chargeStartTime;
        
        // Cần ít nhất 2 điểm để tạo thành một cú vuốt
        if (this._dragPath.length < 2) return;
        
        const startPos = this._dragPath[0];
        // Lấy điểm cuối cùng thực tế người chơi chạm
        const endPos = e.data.global;
        // Đảm bảo điểm cuối cùng được thêm vào path để tính toán chính xác
        this._dragPath.push({ x: endPos.x, y: endPos.y });

        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y; // dy âm là vuốt lên
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Deadzone: Nếu vuốt quá ngắn thì bỏ qua
        if (dist < 30) return;

        // --- 1. TÍNH VẬN TỐC CƠ BẢN (Tương tự như trước) ---
        
        // Tốc độ dựa trên khoảng cách / thời gian vuốt
        let speed = (dist / Math.max(duration, 100)) * 14; 
        // Kìm hãm tốc độ
        speed = Math.max(8, Math.min(speed, 48));

        // --- 2. TÍNH LỰC XOÁY (CURVE FACTOR) ---
        // Đây là chìa khóa để tạo ra đường bóng cong như hình
        this._curveFactor = this.calculateCurveFactor(startPos, endPos, this._dragPath);

        // --- 3. TÍNH VẬN TỐC KHỞI TẠO (X, Y, Z) ---
        
        
        this._vx = dx * 0.14 + this._curveFactor * 7;

        
        this._vy = Math.max(1, Math.abs(dy) * 0.0395);

        
        this._vz = speed;

        // --- 4. SETUP TRẠNG THÁI ---
        this._z = 0;
        this._altitude = 0;
        this._isMoving = true;
        this._state = 'FLYING';
        
        // Reset flags
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

        // Visual tweaks
        try {
            const currentRendered = (this.ballSprite?.scale.x) ? this.ballSprite.scale.x / 0.8 : null;
            if (currentRendered !== null) this._displayScale = currentRendered;
            this._forceScaleFrames = 8;
        } catch (e) {}
        try { this.setAboveKeeper(); } catch (e) {}

        if (this._debugLogs) {
            console.log('CURVED_SHOT', {
                dx: dx.toFixed(1),
                dy: dy.toFixed(1),
                vx: this._vx.toFixed(2),
                vy: this._vy.toFixed(2),
                vz: this._vz.toFixed(2),
                curve: this._curveFactor.toFixed(3)
            });
        }
    };

    // ADDED: Hàm tính toán độ cong của cú vuốt
    private calculateCurveFactor(start: {x:number, y:number}, end: {x:number, y:number}, path: any[]) {
         if (path.length < 3) return 0; // Cần ít nhất 3 điểm để xác định độ cong

         let maxDeviation = 0;
         // Vector từ start đến end (đường thẳng tham chiếu)
         const dx = end.x - start.x;
         const dy = end.y - start.y;
         const lenSq = dx*dx + dy*dy;
         if (lenSq < 1e-6) return 0;

         // Vector pháp tuyến (vuông góc) chuẩn hóa (hướng sang phải so với hướng vuốt)
         // Nếu vector chính là (dx, dy) thì pháp tuyến là (-dy, dx)
         const nx = -dy;
         const ny = dx;
         const len = Math.sqrt(lenSq);
         const unitNx = nx / len;
         const unitNy = ny / len;

         // Tìm điểm trên quỹ đạo lệch xa nhất khỏi đường thẳng tham chiếu
         for (let i = 1; i < path.length - 1; i++) {
             const p = path[i];
             // Vector từ start đến điểm p
             const pdx = p.x - start.x;
             const pdy = p.y - start.y;
             
             // Chiếu vector (pdx, pdy) lên vector pháp tuyến (Dot product)
             // Giá trị này dương nếu điểm p nằm bên phải đường thẳng, âm nếu nằm bên trái
             const deviation = pdx * unitNx + pdy * unitNy;

             // Lưu lại độ lệch lớn nhất (giữ nguyên dấu)
             if (Math.abs(deviation) > Math.abs(maxDeviation)) {
                 maxDeviation = deviation;
             }
         }

         // Tuning: Chia cho một hệ số để chuẩn hóa lực xoáy
         // Hệ số 0.006 là một giá trị thử nghiệm, có thể tăng/giảm để bóng xoáy mạnh/yếu hơn
         // Clamp lại trong khoảng [-1.2, 1.2] để tránh xoáy quá gắt
         return Math.max(-1.2, Math.min(1.2, maxDeviation * 0.006));
     }

    // --- MAIN LOOP ---

    private update() {
        if (!this._isMoving) return;

        // ============================================================
        // 1. PHYSICS INTEGRATION
        // ============================================================
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
        this._altitude += this._vy * _speedMod;

        // --- GOAL CONFIRMATION ---
        try {
            // If ball passed goal line but is above the horizon, treat as OUT (no goal)
            if (this._z >= this.GOAL_DISTANCE && this._altitude > this.MAX_GOAL_HEIGHT * 1.1) {
                // Clear any pending/confirmed goal state and prevent keeper from reacting
                this._goalPending = false;
                this._goalConfirmed = false;
                this._potentialGoal = false;
                this._ignoreGoalkeeper = true;
                this._everOverBar = true;
            } else if (!this._goalConfirmed && this.goal && this._z >= this.GOAL_DISTANCE && this.goal.isInGoalArea(this.x, this.y)) {
                if (this._altitude < this.MAX_GOAL_HEIGHT) {
                    this._goalConfirmed = true;
                    try { if (this.goalConfirmCallback) this.goalConfirmCallback(); } catch (e) {}
                } else {
                    this._everOverBar = true;
                }
            }
        } catch (e) {}

        // ============================================================
        // 2. PERSPECTIVE & GROUND (SỬA LỖI DÍNH BÓNG TẠI ĐÂY)
        // ============================================================
        const tDepth = this._z / this.GOAL_DISTANCE;
        
        // B1: Xác định vị trí mặt đất tại vạch vôi
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
        
        // B2: Tính vị trí mặt đất hiện tại (KHAI BÁO BIẾN)
        let currentGroundVisualY;

        // [LOGIC MỚI] Xử lý đường chân trời mềm mại (Smooth Horizon)
        if (tDepth <= 1) {
            // Trước vạch vôi: Tuyến tính bình thường
            currentGroundVisualY = this._groundLevelY + (targetGroundY - this._groundLevelY) * tDepth;
        } else {
            // Sau vạch vôi (Ra sau gôn): Dùng hàm tiệm cận (Asymptotic)
            // Thay vì kẹp cứng, ta cho nó tiến dần tới đường chân trời nhưng chậm dần đều
            // Horizon Limit: Cao hơn vạch vôi 60px
            const horizonOffset = 60; 
            const extraDepth = tDepth - 1; // Độ sâu vượt quá gôn
            
            // Công thức: Y = GoalY - Offset * (1 - 1 / (1 + factor * depth))
            // Giúp bóng đi xa bao nhiêu cũng không bao giờ vượt quá Horizon, nhưng vẫn di chuyển mượt
            const curve = 1 - (1 / (1 + 0.6 * extraDepth));
            currentGroundVisualY = targetGroundY - (horizonOffset * curve);
        }

        const newY = currentGroundVisualY - this._altitude;
        if (Number.isFinite(newY)) {
            this.y = newY;
        }

        // ============================================================
        // 3. LAYERING LOGIC
        // ============================================================
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

        // ============================================================
        // 4. SCALE & VISUALS
        // ============================================================
        const finalScale = typeof (this as any).finalScaleNow !== 'undefined' ? (this as any).finalScaleNow : this.computeFinalScaleForY((this.parent||this).toGlobal(new PIXI.Point(this.x, this.y)).y);
        
        // [QUAN TRỌNG] Khởi tạo dScale chắc chắn là số (number)
        // Logic: Nếu _displayScale có giá trị thì lấy nó, nếu là null thì lấy finalScale
        let dScale: number = (this._displayScale !== null) ? this._displayScale : finalScale;

        // Bây giờ dScale chắc chắn là number, TypeScript sẽ không bao giờ báo lỗi nữa
        if (this._forceScaleFrames && this._forceScaleFrames > 0) {
            this._forceScaleFrames -= 1;
            // Không cần tính toán lerp, gán cứng luôn
        } else {
            const delta = finalScale - dScale;
            const growLerp = 0.65; 
            const shrinkLerp = 0.1;
            const lerpFactor = delta > 0 ? growLerp : shrinkLerp;
            
            dScale += delta * lerpFactor;
        }

        // Lưu ngược lại vào biến class để dùng cho frame sau
        this._displayScale = dScale;
        
        // Áp dụng vào sprite
        this.ballSprite.scale.set(0.8 * dScale, 0.8 * dScale);

        this.ballSprite.rotation += this._vx * 0.05 + this._curveFactor * 0.2;
        this.updateShadow(currentGroundVisualY, finalScale);
        
        if (this._debugOverlayEnabled && this._debugOverlayGraphics) {
            this.drawDebugOverlay();
        }

        // ============================================================
        // 5. COLLISIONS
        // ============================================================
        try { this.checkNetContact(); } catch (e) {}

        if (this._altitude <= 0) {
            this._altitude = 0;
            if (this._pendingBarDown) {
               this.resolveBarDown();
            }

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
            if (!this._ballUsed) {
                this.checkGameCollisions();
            }
        }

        if (this.goalkeeper && this._z > this.GOAL_DISTANCE * 0.5 && this._vz > 0 && !this._ballUsed && !this._keeperCooldown && !this._ignoreGoalkeeper) {
            this.triggerGoalkeeper();
        }

        // --- STOP CONDITIONS ---
        // Giảm giới hạn xa xuống 1200 để bóng không bay mãi mãi
        // Nếu bóng gần dừng hẳn thì cũng kết thúc
        const stopped = Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0;
        if (this._z > 1200 || stopped) {
            this.finishTurn();
        }

        if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this._z)) {
            this.emergencyReset();
        }

        try { this._prevX = this.x; this._prevY = this.y; } catch (e) {}
    }
    // --- Helper: Ngăn bóng kẹt lại trên cột (quan trọng!) ---
    private preventRestOnPost(obj: any, incoming: number, inNet: boolean, side: 'left' | 'right'): boolean {
        try {
            // Nếu bóng đã vào lưới và đang di chuyển chậm ra ngoài, coi như bàn thắng
            if (inNet && this._vz > -5) {
                try {
                    spawnImpactEffect(this.parent || this, this.x, this.y);
                    // soundController.playSfx('./Assets/sound/click.mp3'); 
                } catch (e) { }
                try { this.handleGoal(); } catch (e) { }
                
                this._ignorePostCollisions = true;
                this._pushedOffByPost = false;
                return true;
            }

            try {
                const bounds = obj.getBounds();
                const postCenterX = bounds.x + bounds.width / 2;
                const sign = Math.sign(this.x - postCenterX) || 1;
                
                // Tính lực đẩy ra (Nudge) dựa trên tốc độ bay vào
                const nudge = Math.max(6, Math.min(28, incoming * 0.5 + 6));
                
                // Dời vị trí bóng ra khỏi cột ngay lập tức để tránh kẹt
                const newX = postCenterX + sign * (bounds.width / 2 + (this.ballSprite.width / 2) * 0.8 + 8);
                
                if (Number.isFinite(newX)) {
                    this.x = newX;
                } else {
                    this.x += (sign > 0 ? 25 : -25);
                }

                spawnImpactEffect(this.parent || this, this.x, this.y);
                
                // Phản lực đẩy ra
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
        if (this._ignorePostCollisions) return false;
        if (!this.goal) return false;

        // If ball is above the horizon (very high altitude), ignore post/crossbar collisions
        if (this._altitude > this.MAX_GOAL_HEIGHT * 1.1) return false;

        const r = (this.ballSprite.width / 2) * 0.8; 

        const now = Date.now();
        // Cooldown ngắn để tránh va chạm kép
        if (now - this._lastPostCollisionTime < 300) {
            return false;
        }

        const converter = this.parent || this;
        const prevGlobal = converter.toGlobal(new PIXI.Point(this._prevX, this._prevY));
        const currGlobal = converter.toGlobal(new PIXI.Point(this.x, this.y));

        // --- Helper 1: Kiểm tra đoạn thẳng (quỹ đạo bóng) cắt hình chữ nhật (cột) ---
        const segmentIntersectsRect = (wx1: number, wy1: number, wx2: number, wy2: number, rect: any, pad: number) => {
            try {
                const left = rect.x - pad;
                const right = rect.x + rect.width + pad;
                const top = rect.y - pad;
                const bottom = rect.y + rect.height + pad;
                
                // Quick reject
                if ((wx1 < left && wx2 < left) || (wx1 > right && wx2 > right) || (wy1 < top && wy2 < top) || (wy1 > bottom && wy2 > bottom)) return false;
                
                // Kiểm tra 2 đầu mút có nằm trong rect không
                if (wx1 >= left && wx1 <= right && wy1 >= top && wy1 <= bottom) return true;
                if (wx2 >= left && wx2 <= right && wy2 >= top && wy2 <= bottom) return true;
                
                // Kiểm tra đoạn thẳng cắt các cạnh của rect
                const lineIntersects = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
                    const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
                    if (Math.abs(denom) < 1e-6) return false;
                    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom;
                    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denom;
                    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
                };
                if (lineIntersects(wx1, wy1, wx2, wy2, left, top, right, top)) return true;
                if (lineIntersects(wx1, wy1, wx2, wy2, right, top, right, bottom)) return true;
                if (lineIntersects(wx1, wy1, wx2, wy2, right, bottom, left, bottom)) return true;
                if (lineIntersects(wx1, wy1, wx2, wy2, left, bottom, left, top)) return true;
                return false;
            } catch (e) { return false; }
        };

        // --- Helper 2: Kiểm tra hình tròn (bóng) va chạm hình chữ nhật ---
        const checkHit = (obj: any) => {
            if (!obj) return false;
            try {
                const bounds = obj.getBounds();
                const left = bounds.x;
                const right = bounds.x + bounds.width;
                const top = bounds.y;
                const bottom = bounds.y + bounds.height;
                const bx = currGlobal.x;
                const by = currGlobal.y;
                const closestX = Math.max(left, Math.min(bx, right));
                const closestY = Math.max(top, Math.min(by, bottom));
                const dx = bx - closestX;
                const dy = by - closestY;
                return (dx * dx + dy * dy) <= (r * r + 1e-6);
            } catch (e) { return false; }
        };

        // --- Kiểm tra va chạm tổng thể (Swept Check) ---
        const sweptPad = Math.max(6, r * 1.1);
        const hitLeft = (this.goal.leftPost && (checkHit(this.goal.leftPost) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.leftPost.getBounds(), sweptPad)));
        const hitRight = (this.goal.rightPost && (checkHit(this.goal.rightPost) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.rightPost.getBounds(), sweptPad)));
        const hitCross = (this.goal.crossbar && (checkHit(this.goal.crossbar) || segmentIntersectsRect(prevGlobal.x, prevGlobal.y, currGlobal.x, currGlobal.y, this.goal.crossbar.getBounds(), sweptPad)));

        // --- Xử lý va chạm Xà Ngang (Crossbar) ---
        if (hitCross) {
            try {
                const bounds = this.goal.crossbar.getBounds();
                const centerY = bounds.y + bounds.height / 2;
                // Chỉ tính va chạm khi bóng đang rơi xuống hoặc bay sâu vào gôn
                const falling = this._vy < 0 || this._vz > 0;
                
                if (falling) {
                    spawnImpactEffect(this.parent || this, this.x, this.y);
                    if (this._debugLogs) console.log('EFFECT: CROSSBAR_IMPACT', { x: this.x, y: this.y });
                    
                    const edgeThreshold = centerY + bounds.height * 0.25;
                    const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);
                    
                    // Nếu tâm bóng nằm thấp hơn mép dưới xà (Screen Y lớn hơn) -> Bar Down
                    if (this.y > edgeThreshold) {
                        // --- BAR-DOWN: Đập mép dưới văng xuống đất ---
                        this._vy = -Math.abs(this._vy) - Math.max(6, incoming * 0.15);
                        this._vz = Math.min(this._vz, 6);
                        this._vx *= 0.6;
                        this._pendingBarDown = true;
                        this._state = 'HIT_BAR_DOWN';
                    } else {
                        // --- BAR-UP: Đập mặt trên/ngoài văng lên trời ---
                        const refl = this.reflectVec3(this._vx, this._vy, this._vz, 0, -1, 0, this.RESTITUTION_CROSS);
                        this._vx = refl.x + (Math.random() - 0.5) * 6;
                        this._vy = Math.max(6, Math.abs(refl.y));
                        this._vz = Math.sign(this._vz || 1) * Math.max(4, Math.abs(refl.z));
                        this._pushedOffByPost = true;
                        this._ignorePostCollisions = true;
                        this._state = 'HIT_BAR_UP';
                        this._targetZ = null;
                    }
                    
                    this._lastPostCollisionTime = now;
                    // Fix giật scale khi va chạm
                    try {
                        const worldPt = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                        this._displayScale = this.computeFinalScaleForY(worldPt.y);
                        this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
                        this._forceScaleFrames = 2;
                    } catch(e) {}
                    
                    return true;
                }
            } catch (e) {}
        }

        // --- Xử lý va chạm Cột Dọc (Post Handling) ---
        const handlePost = (obj: any, side: 'left' | 'right') => {
            if (!obj) return false;
            try {
                const bounds = obj.getBounds();
                const postCenterX = bounds.x + bounds.width / 2;
                
                // Chỉ xử lý nếu bóng đang lao về phía cột
                if ((postCenterX - currGlobal.x) * this._vx <= 0 && (now - this._lastPostCollisionTime) < 200) return false;

                // Check bóng đang ở trong gôn hay ngoài
                let inNet = false;
                try {
                    const converter = this.parent || this;
                    const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
                    const goalLocal = this.goal.toLocal(worldPt);
                    inNet = !!(this.goal && this.goal.isInGoalArea(goalLocal.x, goalLocal.y));
                } catch (e) { inNet = false; }

                const incoming = Math.sqrt(this._vx * this._vx + this._vz * this._vz + this._vy * this._vy);

                // Gọi helper xử lý chống kẹt bóng
                if (this.preventRestOnPost(obj, incoming, inNet, side)) {
                    this._lastPostCollisionTime = now;
                    return true;
                }

                // Logic nảy
                const sign = Math.sign(currGlobal.x - postCenterX) || 1;
                
                if (inNet) {
                    // Má trong (Inner Hit) -> Nảy vào gôn
                    const inwardSign = (side === 'left') ? 1 : -1;
                    const nudge = Math.max(4, Math.min(28, incoming * 0.35));
                    
                    this._vx = inwardSign * nudge;
                    this._vz = Math.sign(this._vz || 1) * Math.max(2, Math.abs(this._vz) * 0.25);
                    this._vy = Math.max(2, Math.abs(this._vy) * 0.3 + nudge * 0.08);
                    
                    this._state = 'HIT_POST_IN';
                    
                    // Drama: Đập 2 cột liên tiếp
                    if (this._lastPostHitSide && this._lastPostHitSide !== side && (now - this._lastPostHitTime) < 800) {
                         this._vx = (side === 'left' ? 1 : -1) * Math.max(12, Math.abs(this._vx) * 1.2);
                    }
                } else {
                    // Má ngoài (Outer Hit) -> Văng ra ngoài
                    const refl = this.reflectVec3(this._vx, this._vy, this._vz, Math.sign(this.x - postCenterX), 0, 0, this.RESTITUTION_POST);
                    
                    this._vx = refl.x + (Math.random() - 0.5) * 4;
                    this._vz = -Math.max(6, Math.abs(refl.z)); // Văng ngược ra xa (Z âm)
                    this._vy = Math.abs(refl.y);
                    
                    if (!inNet) {
                        this._pushedOffByPost = true;
                        this._ignorePostCollisions = true;
                    }
                    this._state = 'HIT_POST_OUT';
                }

                spawnImpactEffect(this.parent || this, this.x, this.y);
                this._lastPostCollisionTime = now;
                this._lastPostHitSide = side;
                this._lastPostHitTime = now;
                
                // Fix visual scale
                try {
                    const worldPt = (this.parent || this).toGlobal(new PIXI.Point(this.x, this.y));
                    this._displayScale = this.computeFinalScaleForY(worldPt.y);
                    this.ballSprite.scale.set(0.8 * this._displayScale, 0.8 * this._displayScale);
                    this._forceScaleFrames = 2;
                } catch(e) {}
                
                return true;
            } catch (e) { return false; }
        };

        if (hitLeft) { if (handlePost(this.goal.leftPost, 'left')) return true; }
        if (hitRight) { if (handlePost(this.goal.rightPost, 'right')) return true; }

        return false;
    }
    // --- COLLISION LOGIC (Tiếp theo) ---

    private checkGameCollisions() {
        // Nếu đã check va chạm cột rồi thì bỏ qua
        // (Lưu ý: checkPostCollisions được gọi trước trong update)
        
        // Kiểm tra xem bóng có nằm trong vùng khung thành không
        if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
            // Nếu độ cao thấp hơn xà ngang -> Có thể là bàn thắng
            if (this._altitude < this.MAX_GOAL_HEIGHT) {
                this._potentialGoal = true;
            } else {
                // Bóng bay cao hơn xà ngang
                if (this._debugLogs) console.log('Over the bar!');
            }
        }
    }

    private checkNetContact() {
        try {
            if (this._netContacted) return;
            if (!this.goal || !this.goal.netSprite) return;
            if (!this.parent) return;

            // If ball is above the horizon (very high altitude), ignore net collisions
            if (this._altitude > this.MAX_GOAL_HEIGHT * 1.1) return;

            // [QUAN TRỌNG 1] Kiểm tra độ sâu (Z-Check)
            // Bóng phải bay gần đến vạch vôi (GOAL_DISTANCE = 600) mới được tính chạm lưới
            // Trừ hao 50 đơn vị (tức là z >= 550) để tạo cảm giác bóng đập lưới phồng ra
            if (this._z < this.GOAL_DISTANCE - 20) return;

            const ballBounds = this.ballSprite.getBounds();
            const ballCenterX = ballBounds.x + ballBounds.width / 2;
            const ballCenterY = ballBounds.y + ballBounds.height / 2;
            const ballRadius = Math.max(ballBounds.width, ballBounds.height) / 2 * 0.9;
            
            const netBounds = this.goal.netSprite.getBounds();
            
            // [QUAN TRỌNG 2] Thu nhỏ Hitbox lưới (Inset)
            // Để tránh bóng dính vào mép ngoài cùng của lưới, ta co hitbox vào trong
            const paddingX = 15; // Co vào 15px mỗi bên trái/phải
            const paddingY = 15; // Co vào 15px từ trên xuống
            
            // Hitbox thực tế nhỏ hơn hình ảnh một chút
            const effectiveLeft = netBounds.x + paddingX;
            const effectiveRight = netBounds.x + netBounds.width - paddingX;
            const effectiveTop = netBounds.y + paddingY;
            const effectiveBottom = netBounds.y + netBounds.height; // Đáy giữ nguyên hoặc co ít

            // Tìm điểm gần nhất trên Hitbox đã thu nhỏ
            const closestX = Math.max(effectiveLeft, Math.min(ballCenterX, effectiveRight));
            const closestY = Math.max(effectiveTop, Math.min(ballCenterY, effectiveBottom));
            
            const dx = ballCenterX - closestX;
            const dy = ballCenterY - closestY;
            const dist2 = dx * dx + dy * dy;

            // Nếu chạm lưới
            if (dist2 <= (ballRadius * ballRadius)) {
                this._netContacted = true;
                this._lastNetContactTime = Date.now();
                this._lastNetContactZ = this._z;
                
                spawnImpactEffect(this.parent || this, this.x, this.y);
                
                // --- Logic dừng bóng (Hãm lực) ---
                this._vz = 0.5;   
                this._vx *= 0.05; 
                
                if (this._vy > 0) this._vy = 0; 
                this._vy -= 3; // Rơi xuống
                
                this._state = 'STUCK_IN_NET';
                
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

    // --- GOALKEEPER & SCORING ---

    private handleGoal() {
        if (this._goalPending) return;
        this._goalPending = true;
        
        spawnImpactEffect(this.parent || this, this.x, this.y);
        
        // Logic hút bóng vào lưới (Visual Settle)
        this._targetZ = Math.min(this._z, this.GOAL_DISTANCE);
        this._vz = Math.min(this._vz, 3); // Giảm tốc độ chiều sâu
        this._vx *= 0.2; // Giảm tốc độ ngang
        this._vy = -6;   // Cho bóng rơi xuống đất
        this._isMoving = true;
    }

    private triggerGoalkeeper() {
        if (this._keeperRequestInFlight) return;
        this._keeperRequestInFlight = true;
        
        let zone = null as any;
        if (this.goal) {
             try { zone = this.goal.getZoneFromPosition(this.x, this.y); } catch(e) {}
        }
        const ballRadius = this.ballSprite.width / 2;

        // Gọi hàm bắt bóng của thủ môn (trả về Promise)
        this.goalkeeper.attemptCatch(this.x, this.y, zone, ballRadius).then((result: any) => {
            if (result.caught) {
                // --- THỦ MÔN BẮT DÍNH HOẶC ĐẨY BÓNG ---
                this._ignorePostCollisions = true;
                this._savedPending = true; 
                this._potentialGoal = false;
                this._goalPending = false;
                this._ignoreGoalkeeper = true;
                this._keeperCooldown = true;
                
                spawnImpactEffect(this.parent || this, this.x, this.y);
                console.log("Saved by Keeper!");
                
                // Đảm bảo bóng hiện TRÊN thủ môn khi bị đẩy ra
                try { this.setAboveKeeper(); } catch (e) {}

                // Tạo lực đẩy bóng ra xa (Deflect)
                const reboundPower = Math.abs(this._vz) * 0.4 + Math.random() * 5;
                
                this._vz = -reboundPower; // Bật ngược lại phía camera
                this._vy = Math.random() * 8 + 4; // Nảy lên cao ngẫu nhiên (từ 4 đến 12)
                
                // Bật sang trái/phải ngẫu nhiên mạnh hơn
                // Random từ -15 đến 15
                this._vx = (Math.random() - 0.5) * 30; 
                
                // Thêm độ xoáy loạn xạ khi bị cản phá
                this._curveFactor = (Math.random() - 0.5) * 5;
                // ---------------------
                
                this._displayScale = null;
                this._targetZ = null;
                
                setTimeout(() => this._keeperCooldown = false, 1000);
                this._keeperRequestInFlight = false;
            } else {
                // --- THỦ MÔN BẮT HỤT ---
                this._keeperRequestInFlight = false;
                this._ignoreGoalkeeper = true; // Không check lại lần này nữa
                
                // Logic đẩy thủ môn ra nếu bóng bay xuyên qua người (tránh lỗi xuyên hình)
                // (Logic nudge keeper giữ nguyên từ code gốc của bạn)
                try {
                     const p = this.parent;
                     const keeper = this.goalkeeper;
                     if (keeper && p && keeper.parent === p) {
                          const kx = keeper.x; const ky = keeper.y;
                          const bx = this.x; const by = this.y;
                          const dx = bx - kx; const dy = by - ky;
                          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                          const keeperRadius = 40; // ước lượng
                          const minDist = keeperRadius + ballRadius * 0.8 + 140; // Padding
                          
                          if (dist < minDist) {
                              const move = Math.max(minDist - dist + 14, 42);
                              // Đẩy thủ môn tránh ra
                              const nx = (kx - bx) / dist || 1;
                              const ny = (ky - by) / dist || 0;
                              keeper.x = kx + nx * move;
                              keeper.y = ky + ny * move;
                          }
                     }
                } catch(e) {}
            }
        });
    }

    private resolveBarDown() {
        // Xử lý logic khi bóng đập xà văng xuống đất
        const goalLineZ = this.GOAL_DISTANCE;
        
        // Nếu bóng rơi ở phía sau vạch vôi -> Bàn thắng
        if (this._z >= goalLineZ) {
             try {
                if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
                    this.handleGoal();
                    this._pendingBarDown = false;
                    this._isMoving = true;
                    return;
                }
            } catch (e) {}
            // Nếu không nằm trong khung thành
            this._pushedOffByPost = true;
            this._pendingBarDown = false;
        } else {
            // Bóng rơi phía trước vạch vôi -> Không vào
            this._pushedOffByPost = true;
            this._pendingBarDown = false;
        }
    }

    private finishTurn() {
        if (!this._isMoving) return;
        this._isMoving = false;
        this._ignorePostCollisions = false;
        
        // 1. Trường hợp bị Cản phá (Saved)
        if (this._savedPending) {
            this._savedPending = false;
            this._ballUsed = true;
            try { if (this.saveCallback) this.saveCallback(); } catch (e) {}
            return;
        }

        // 2. Trường hợp Ghi bàn (Goal)
        const now = Date.now();
        // Check nới lỏng: nếu mới chạm lưới gần đây thì cũng tính
        const recentNetContact = !!(this._lastNetContactTime && (now - this._lastNetContactTime) < 2000);
        const hadGoalCandidate = (this._goalPending || this._goalConfirmed || recentNetContact);
        
        if (hadGoalCandidate) {
            this._goalPending = false;
            this._potentialGoal = false;
            this._goalScored = true;
            this._ballUsed = true;
            
            let zone = null;
            if(this.goal) try { zone = this.goal.getZoneFromPosition(this.x, this.y); } catch(e){}
            
            try { if (this.goalScoredCallback) this.goalScoredCallback(zone); } catch (e) {}
            return;
        }

        // 3. Trường hợp Ra ngoài (Out)
        if (this._z > this.GOAL_DISTANCE && !this._goalScored) {
            console.log("Ball is OUT (Behind Goal)");
            
            // Đảm bảo bóng nằm sau lưới
            try {
                if (this.parent && this.goal) {
                    const goalIndex = this.parent.getChildIndex(this.goal);
                    this.parent.setChildIndex(this, Math.max(0, goalIndex - 1));
                }
            } catch(e) {}
        }

        this._isMoving = false;
        this._ignorePostCollisions = false;

        // Callback ra ngoài
        if (this.outCallback) this.outCallback();
        
        if (this.onBallDestroyed) {
            setTimeout(this.onBallDestroyed, 1000);
        }
    }

    private emergencyReset() {
        // Reset bóng về giữa sân nếu toạ độ bị lỗi (NaN/Infinity)
        this.x = BASE_WIDTH / 2;
        this.y = (BASE_HEIGHT * 3) / 4;
        this._z = 0.1;
        this._vx = 0.1;
        this._vy = 0.1;
        this._vz = 0.1;
        this._keeperRequestInFlight = false;
        this._ignoreGoalkeeper = true;
        this.finishTurn();
    }
    
    // --- DISPLAY & DEBUG HELPER ---
    
    private drawDebugOverlay() {
         try {
            const g = this._debugOverlayGraphics!;
            g.clear();
            g.lineStyle(2, 0xFF0000, 0.9);
            g.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
            const px = this.x;
            const py = this.y;
            g.beginFill(0x00FF00, 0.9);
            g.drawCircle(px, py, 6);
            g.endFill();
            
            if (this._debugOverlayText) {
                this._debugOverlayText.text = `x:${px.toFixed(1)} y:${py.toFixed(1)} z:${this._z.toFixed(1)} alt:${this._altitude.toFixed(1)}`;
                this._debugOverlayText.x = Math.max(4, Math.min(BASE_WIDTH - 160, px + 12));
                this._debugOverlayText.y = Math.max(4, Math.min(BASE_HEIGHT - 24, py - 18));
            }
        } catch (e) {}
    }

    private updateShadow(groundY: number, scale: number) {
        if (!this.shadowSprite) return;
        this.shadowSprite.clear();
        // Bóng càng cao (altitude lớn) thì bóng đổ càng mờ
        const shadowAlpha = 0.3 * Math.max(0, 1 - (this._altitude / 300));
        const shadowScale = scale * Math.max(0.5, 1 - (this._altitude / 200));
        
        this.shadowSprite.beginFill(0x000000, shadowAlpha);
        this.shadowSprite.drawEllipse(0, 0, 20 * shadowScale, 10 * shadowScale);
        this.shadowSprite.endFill();
        // Shadow luôn nằm ở mặt đất (+ một chút offset theo scale)
        this.shadowSprite.position.set(0, this._altitude + 15 * scale); 
    }

    public getVisualScale(): number {
        try {
            const converter = this.parent || this;
            const worldPt = converter.toGlobal(new PIXI.Point(this.x, this.y));
            const finalScale = this.computeFinalScaleForY(worldPt.y);
            // Dùng giá trị displayScale đã được làm mượt (smoothed)
            const display = this._displayScale === null ? finalScale : this._displayScale;
            return 0.8 * display;
        } catch (e) { return (this._baseScale || 1) * 0.8; }
    }

    public setAboveKeeper() {
        try {
            const p = this.parent as any;
            const keeper = this.goalkeeper;
            if (p && keeper && keeper.parent === p) {
                const keeperIndex = p.getChildIndex(keeper);
                // Đặt bóng nằm trên layer thủ môn
                const topIndex = Math.max(0, Math.min(p.children.length - 1, keeperIndex + 1));
                p.setChildIndex(this, topIndex);
            }
        } catch (e) {}
    }

    public setBelowKeeper() {
        try {
            const p = this.parent as any;
            const keeper = this.goalkeeper;
            if (p && keeper && keeper.parent === p) {
                const keeperIndex = p.getChildIndex(keeper);
                // Đặt bóng nằm dưới layer thủ môn
                const newIndex = Math.max(0, keeperIndex - 1);
                p.setChildIndex(this, newIndex);
            }
        } catch (e) {}
    }

    private computeFinalScaleForY(worldY: number, screenHeight?: number): number {
        const sh = screenHeight || (typeof window !== 'undefined' ? window.innerHeight : BASE_HEIGHT);
        const yNorm = Math.max(0, Math.min(1, worldY / sh));
        
        // Tinh chỉnh độ lớn bóng dựa trên vị trí Y màn hình
        const minFactor = 0.4; // Bóng ở xa (trên cao màn hình)
        const maxFactor = 1.4; // Bóng ở gần (dưới thấp màn hình)
        const exponent = 1.5; 
        const visualFactor = minFactor + (maxFactor - minFactor) * Math.pow(yNorm, exponent);
        
        return this._baseScale * visualFactor;
    }
    
    public checkAndLogScale(eventName: string) {
        // Hàm debug, để trống trong production cũng được
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