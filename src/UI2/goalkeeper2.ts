import { Container } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BASE_WIDTH } from '../constant/global';

export default class Goalkeeper2 extends Container {
    private spine!: Spine;
    private _initialPosition = { x: 0, y: 0 };

    // Physics
    public isGrounded: boolean = true;
    private velocity: { x: number; y: number } = { x: 0, y: 0 };
    private isFallen: boolean = false;
    private isDiving: boolean = false;
    private isPrepared: boolean = false;
    private fallenTime: number = 0;
    private readonly MAX_FALLEN_TIME: number = 3000;

    private gravity: number = 1.1; // Tăng một chút để rơi gắt hơn
    private targetRotation: number = 0;
    private rotationSpeed: number = 0.25;

    // Swipe tracking
    private swipeStart: { x: number; y: number; time: number } | null = null;
    private swipeArea: Container | null = null;
    private _boundPointerDown: (e: any) => void;
    private _boundPointerUp: (e: any) => void;

    constructor() {
        super();
        this._boundPointerDown = this.onPointerDown.bind(this);
        this._boundPointerUp = this.onPointerUp.bind(this);
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'r') this.reset();
        });
    }

    //#region Init
    public init(spineAsset: Spine) {
        if (!spineAsset) return;
        this.removeChildren();
        this.spine = spineAsset;
        this.spine.visible = true;
        this.spine.alpha = 1;
        if (this.spine.update) this.spine.update(0.016);
        try {
            const animations = this.spine.skeleton?.data?.animations || [];
            const idleAnim = animations.find((a: any) => a.name === 'idle') || animations[0];
            if (idleAnim && this.spine.state) {
                this.spine.state.setAnimation(0, idleAnim.name, true);
            }
        } catch (e) {}
        this.spine.x = 0;
        this.spine.y = 0;
        this.addChild(this.spine);
    }

    public setSwipeArea(container: Container) {
        if (this.swipeArea) {
            this.swipeArea.off('pointerdown', this._boundPointerDown);
            this.swipeArea.off('pointerup', this._boundPointerUp);
            this.swipeArea.off('pointerupoutside', this._boundPointerUp);
        }
        this.swipeArea = container;
        this.swipeArea.eventMode = 'static';
        this.swipeArea.on('pointerdown', this._boundPointerDown);
        this.swipeArea.on('pointerup', this._boundPointerUp);
        this.swipeArea.on('pointerupoutside', this._boundPointerUp);
    }

    public setInitialPosition(x: number, y: number) {
        this._initialPosition = { x, y };
        this.x = x;
        this.y = y;
    }
    //#endregion

    //#region Logic Xử lý Vuốt
    private onPointerDown(e: any) {
        const pos = e.global || e.data?.global;
        if (!pos) return;
        this.swipeStart = { x: pos.x, y: pos.y, time: Date.now() };
    }

    private onPointerUp(e: any) {
        if (!this.swipeStart) return;
        const pos = e.global || e.data?.global;
        if (!pos) { this.swipeStart = null; return; }

        const dx = pos.x - this.swipeStart.x;
        const dy = pos.y - this.swipeStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        this.swipeStart = null;

        if (dist > 30) {
            this.handleHybridSwipe(dx, dy, dist);
        }
    }

    private handleHybridSwipe(dx: number, dy: number, dist: number) {
        if (this.isFallen || this.isDiving || this.isPrepared || !this.isGrounded) return;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const isLeft = dx < 0;
        const direction = isLeft ? -1 : 1;

        // Khởi tạo các thông số vật lý
        let jumpForce: number = 0;
        let flySpeed: number = 0;
        let targetRot: number = 0;

        // TÍNH TOÁN RIÊNG BIỆT CHO TỪNG BÊN
        if (isLeft) {
            // --- CASE BÊN TRÁI ---
            if (absDx < 50 && dy < 0) {
                jumpForce = 13; flySpeed = 0; targetRot = 0;
            } else if (absDy > absDx * 1.2) {
                // Bay cao bên trái
                jumpForce = 18; flySpeed = 5; targetRot = -0.9; // Ví dụ: set riêng -0.7
            } else if (absDy < absDx * 0.5) {
                // Đổ thấp bên trái
                jumpForce = 4; flySpeed = 10; targetRot = -1; // Ví dụ: set riêng -0.2
            } else {
                // Bay vừa bên trái
                jumpForce = 13; flySpeed = 8; targetRot = -0.5;
            }
        } else {
            // --- CASE BÊN PHẢI ---
            if (absDx < 50 && dy < 0) {
                jumpForce = 13; flySpeed = 0; targetRot = 0;
            } else if (absDy > absDx * 1.2) {
                // Bay cao bên phải
                jumpForce = 18; flySpeed = 5; targetRot = 0.5; // Set góc dương cho bên phải
            } else if (absDy < absDx * 0.5) {
                // Đổ thấp bên phải
                jumpForce = 4; flySpeed = 10; targetRot = 1;
            } else {
                // Bay vừa bên phải
                jumpForce = 13; flySpeed = 8; targetRot = 0.4;
            }
        }

        // Áp dụng lực vuốt (Cường độ)
        const powerMod = Math.min(Math.max(dist / 250, 0.8), 1.6);
        const finalJump = jumpForce * powerMod;
        const finalSpeed = flySpeed * powerMod;

        // Gán vào biến hệ thống
        this.targetRotation = targetRot;
        if (this.spine) {
            this.spine.skeleton.scaleX = direction;
        }

        console.log(`🧤 DIVE ${isLeft ? 'LEFT' : 'RIGHT'} | Rot: ${targetRot} | Jump: ${finalJump.toFixed(1)}`);
        
        this.startDiveSequence(direction, finalSpeed, finalJump);
    }

    private startDiveSequence(dir: number, speed: number, jumpForce: number) {
        this.isPrepared = true;
        this.isDiving = true;
        this.isGrounded = false;

        const trackEntry = this.playAnimation('Jump', false);
        if (trackEntry) {
            trackEntry.timeScale = 1.8; // Giậm nhảy nhanh
            trackEntry.listener = {
                complete: () => {
                    this.isPrepared = false;
                    this.velocity.y = -jumpForce;
                    this.velocity.x = dir * speed;
                    this.playAnimation('FlyingCatch', false);
                }
            };
        }
    }
    //#endregion

    //#region Physics
    public updatePhysics() {
        if (!this.spine) return;
        if (this.isPrepared) return;

        if (this.spine) {
            this.spine.rotation += (this.targetRotation - this.spine.rotation) * this.rotationSpeed;
        }

        if (this.isFallen) {
            this.velocity.x *= 0.92;
            this.x += this.velocity.x;
            if (Date.now() - this.fallenTime > this.MAX_FALLEN_TIME) this.reset();
            return;
        }

        if (!this.isGrounded) {
            this.velocity.y += this.gravity;
            this.x += this.velocity.x;
            this.y += this.velocity.y;
        }

        this.checkBounds();

        const groundY = this._initialPosition.y;
        if (this.y >= groundY) {
            this.y = groundY;
            if (this.isDiving) {
                this.isDiving = false;
                this.isFallen = true;
                this.isGrounded = true;
                this.fallenTime = Date.now();
                this.velocity.y = 0;
            } else {
                this.reset();
            }
        }
    }

    private checkBounds() {
        const margin = 280; 
        const leftLimit = BASE_WIDTH / 2 - margin;
        const rightLimit = BASE_WIDTH / 2 + margin;
        if (this.x < leftLimit) { this.x = leftLimit; this.velocity.x = 0; }
        else if (this.x > rightLimit) { this.x = rightLimit; this.velocity.x = 0; }
    }

    private playAnimation(name: string, loop: boolean): any {
        if (!this.spine) return null;
        if (this.spine.state.getCurrent(0)?.animation?.name !== name) {
            return this.spine.state.setAnimation(0, name, loop);
        }
        return this.spine.state.getCurrent(0);
    }

    public reset() {
        this.isDiving = false;
        this.isPrepared = false;
        this.isFallen = false;
        this.isGrounded = true;
        this.velocity = { x: 0, y: 0 };
        this.rotation = 0;
        this.targetRotation = 0;
        this.x = this._initialPosition.x;
        this.y = this._initialPosition.y;
        if (this.spine) {
            this.spine.skeleton.scaleX = 1;
            this.spine.rotation = 0;
            this.playAnimation('idle', true);
        }
    }
    //#endregion
}