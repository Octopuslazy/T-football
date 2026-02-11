import { Container } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import Goal from './goal';
import { BASE_WIDTH } from '../constant/global';
import { BallCollision } from './ballCollision';

export enum GoalkeeperAction {
    Case1 = '1',
    Case2 = '2',
    Case3 = '3',
    Case4 = '4',
    Case5 = '5',
    Case6 = '6',
    Case7 = '7',
    Case8 = '8',
    Case9 = '9',
    Case10 = '10',
    Reset = 'Reset',

}

export default class Goalkeeper extends Container {
    private spine!: Spine;
    private _goal: any = null;
    private _onResize: () => void;
    private _initialPosition = { x: 0, y: 0 };

    // Physic
    public isGrounded: boolean = true;
    private velocity: { x: number; y: number } = { x: 0, y: 0 };
    private keys: { [key: string]: boolean } = {};
    private isFallen: boolean = false;
    private isDiving: boolean = false;
    private fallenTime: number = 0; // Track thời gian fallen
    private readonly MAX_FALLEN_TIME: number = 3000; // 3 giây (milliseconds)

    private speed: number = 10;
    private jump: number = 19;
    private gravity: number = 0.8;
    private fallen: number = 10;
    private targetRotation: number = 0;
    private rotationSpeed: number = 0.11;
    private isPrepared: boolean = false;
    private _targetBall: any = null; 
    private _hasAIActed: boolean = false;
    private scleX: number = 0;
    private scleY: number = 0;

    constructor() {
        super();

        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);

        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));

       

    }

    //#region Keys test
    private onKeyDown(e: KeyboardEvent) {
        if (e.code ==='KeyR') {
            this.PerformFall(GoalkeeperAction.Reset);
        }
        if (this.isFallen) return;
        this.keys[e.code] = true;
        if (this.isPrepared) return;
    
        if (this.keys['ArrowUp'] && this.isGrounded) {
            if (this.keys['ArrowLeft']){
                this.dive(-1);
            } else if (this.keys['ArrowRight']){
                this.dive(1);

            } else {
            this.Jump(18);
            }
        }
        if (this.keys['Digit2']) {
            console.log(screen.width, 'Toi da o day');
            this.PerformFall(GoalkeeperAction.Case2);
        }
        if (this.keys['Digit3']) {
            this.PerformFall(GoalkeeperAction.Case3);
        }
        if (this.keys['Digit4']) {
            this.PerformFall(GoalkeeperAction.Case4);
        }
        if (this.keys['Digit5']) {
            this.PerformFall(GoalkeeperAction.Case5);
        }
        if (this.keys['Digit6']) {
            this.PerformFall(GoalkeeperAction.Case6);
        }
        if (this.keys['Digit7']) {
            this.PerformFall(GoalkeeperAction.Case7);
        }
        if (this.keys['Digit8']) {
            this.PerformFall(GoalkeeperAction.Case8);
        }
        if (this.keys['Digit9']) {
            this.PerformFall(GoalkeeperAction.Case9);
        }
        if (this.keys['Digit0']) {
            this.PerformFall(GoalkeeperAction.Case10);
        }
        
        
    }
    private onKeyUp(e: KeyboardEvent) {
        this.keys[e.code] = false;
        
    }

    //#endregion

    //#region Moverment & Physics
    public UpdatePhysics() {
        if (!this.spine) return;

        this.updateAI();

        if (this.isPrepared) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            return; 
        }
        if (Math.abs(this.rotation - this.targetRotation) > 0.01) {
            this.rotation += (this.targetRotation - this.rotation) * this.rotationSpeed;
        } else {
            this.rotation = this.targetRotation;
        }

        if (this.isFallen) {
            this.velocity.x *= 0.8;
            if (Math.abs(this.velocity.x) < 0.1) this.velocity.x = 0;
            this.x += this.velocity.x;
            this.y = this._initialPosition.y;

            // Check nếu fallen quá 3 giây thì auto reset
            if (Date.now() - this.fallenTime > this.MAX_FALLEN_TIME) {
                console.log('⏰ Goalkeeper fallen > 3s, auto reset!');
                this.reset();
                // Reset ball cùng lúc
                if (this._targetBall && typeof this._targetBall.reset === 'function') {
                    this._targetBall.reset('goalkeeper fallen timeout');
                }
            }
            return;
        }

        if (this.keys['ArrowLeft']) {
            this.velocity.x = -this.speed;
        }
        else if (this.keys['ArrowRight']) {
            this.velocity.x = this.speed;
        }
        // else {
        //     this.velocity.x = 0;
            
        // }
        if (!this.isGrounded) {
            this.velocity.y += this.gravity;
        }
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.CheckBounds();

        const groundY = this._initialPosition.y;
        if (this.y >= groundY) {
            this.y = groundY;
            this.velocity.y = 0;
            if (this.isDiving) {
                this.isDiving = false;
                this.isFallen = true;
                this.fallenTime = Date.now(); // Bắt đầu đếm thời gian fallen
                this.isGrounded = true;
                this.y = this._initialPosition.y;
            } else {    
            this.rotation = 0;
            this.targetRotation = 0;
            this.isGrounded = true;
            this.PlayAnimation('idle', true);
            }
        } else {
            this.isGrounded = false;
        }
    }

    private excutePhysics(dir: number, speed: number, jump: number) {
        this.isPrepared = false;
        this.isGrounded = false;
        this.isDiving = true;

        this.velocity.y = -jump;
        this.velocity.x = dir * speed;

        this.PlayAnimation('FlyingCatch', false);
    }


    private Jump(jump: number) {
        if (!this.isGrounded|| this.isPrepared) return;
        this.isPrepared = true;

        this.velocity.y = -this.jump;
        this.targetRotation = 0;
        this.isGrounded = false;

        const trackEntry = this.PlayAnimation('Jump', false);
        if (trackEntry) {
            trackEntry.listener = {
                complete: () => {
                    this.excutePhysics(0, 0, jump);
                }
            };
        }
        
    }

    private dive(direction: number, speed?: number, jump?: number) {
        this.isPrepared = true;
        this.isGrounded = false;
        this.isDiving = true;
        const finalJump = (jump !== undefined) ? jump : this.jump;
        const finalSpeed = (speed !== undefined) ? speed : this.fallen;
        let AngleJump = Math.atan2(finalJump, finalSpeed);
        if (AngleJump > 1.0) AngleJump = 1.0;
        if (AngleJump < 0.1) AngleJump = 0.1;

        this.spine.skeleton.scaleX = direction;

        this.targetRotation = AngleJump*direction;

        const trackEntry = this.PlayAnimation('Jump', false);

        if (trackEntry) {
            trackEntry.listener = {
                complete: () => {
                    // Khi Jump chạy xong, nếu vẫn đang bay (chưa ngã) thì chuyển sang FlyingCatch
                    if (this.isDiving && !this.isFallen) {
                        
                        this.excutePhysics(direction, finalSpeed, finalJump);
                    }
                }
            };
        }
    }
       


    public PlayAnimation(animationName: string, loop = true): any {
        if (!this.spine) return null;

        if (this.spine.state.getCurrent(0)?.animation?.name !== animationName) {
            const trackEntry = this.spine.state.setAnimation(0, animationName, loop);

            // Tăng tốc độ Jump animation lên 1.5x
            if (animationName === 'Jump') {
                trackEntry.timeScale = 1.5;
            }

            return trackEntry;
        }

        return this.spine.state.getCurrent(0);
    }

    //#region Case Perform
    public PerformFall(action: GoalkeeperAction) {  
        if (this.isFallen && action !== GoalkeeperAction.Reset) return;
        
        switch (action){
            case GoalkeeperAction.Case1:
                this.isGrounded && this.PlayAnimation('idle', true);
                break;
            case GoalkeeperAction.Case2:
                if (this.isGrounded) {
                    this.Jump(15);
                    this.TimetoCatchBall(0, 0, 15);
                    
                    console.log(this._goal.x, this._goal.y, this.x, this.y);
                }
                break;
            case GoalkeeperAction.Case3:
                if (this.isGrounded) {
                    this.dive(-1, 1, 13);
                    this.TimetoCatchBall(0, 0, 13);
                }
                break;
            case GoalkeeperAction.Case4:
                if (this.isGrounded) {
                    this.dive(1, 1, 13);
                    this.TimetoCatchBall(0, 0, 13);
                }
                break;
            case GoalkeeperAction.Case5:
                if (this.isGrounded) {
                    this.dive(-1, 5, 18);
                    this.TimetoCatchBall(0, 0, 18);
                }
                break;
            case GoalkeeperAction.Case6:
                if (this.isGrounded) {
                    this.dive(1, 5, 18);
                    this.TimetoCatchBall(0, 0, 18);
                }
                break;
            case GoalkeeperAction.Case7:
                if (this.isGrounded) {
                    this.dive(-1, 6, 8);
                    this.TimetoCatchBall(0, 0, 8);
                }
                break;
            case GoalkeeperAction.Case8:
                if (this.isGrounded) {
                    this.dive(1, 6, 8);
                    this.TimetoCatchBall(0, 0, 8);
                }
                break;
            case GoalkeeperAction.Case9:
                if (this.isGrounded) {
                    this.dive(-1, 1, 18);
                    this.TimetoCatchBall(0, 0, 18);
                }
                break;
            case GoalkeeperAction.Case10:
                if (this.isGrounded) {
                    this.dive(1, 1, 18);
                    this.TimetoCatchBall(0, 0, 18);
                }
                break;
            case GoalkeeperAction.Reset:
                this.reset();
                break;
        }


    }
    //#region create and init goalkeeper
    public init(spineAsset: Spine) {
        if (!spineAsset) {
            return;
        }
        this.removeChildren();
        
        this.spine = spineAsset;

        console.log('🔍 Spine structure:', {
            hasState: !!this.spine.state,
            hasSkeleton: !!this.spine.skeleton,
            skeletonData: !!this.spine.skeleton?.data,
            animations: this.spine.skeleton?.data?.animations?.map((a: any) => a.name)
        });

        // Force visibility
        this.spine.visible = true;
        this.spine.alpha = 1;
        
        // Force update
        if (this.spine.update) {
            this.spine.update(0.016);
        }

        // Play idle animation
        try {
            const animations = this.spine.skeleton?.data?.animations || [];
            
            if (animations.length > 0) {
                const idleAnim = animations.find((a: any) => a.name === 'idle') || animations[0];
                if (idleAnim && this.spine.state) {
                    this.spine.state.setAnimation(0, idleAnim.name, true);
                    console.log('✅ Playing animation:', idleAnim.name);
                }
            }
        } catch (e) {
            console.warn('⚠️ Failed to set animation:', e);
        }

        // Add spine at center of container
        this.spine.x = 0;
        this.spine.y = 0;
        this.addChild(this.spine);

        this.updateScale();
        this.reset();
    }


    public setGoal(goal: any) {
        this._goal = goal;
        this.updateScale();
    }

    private setInitialPosition(x: number, y: number) {
        this._initialPosition = { x, y: y };
        this.x = x;
        this.y = y;
        if (this.isGrounded) {
            this.x = x;
            this.y = this._initialPosition.y;
        }
    }
    
    //#endregion
    //#region Scale and Position
    private updateScale() {
        if (!this.spine) return;

        // Lấy thông tin goal
        if (!this._goal || !this._goal.goalSprite) return;
        
        const goal = this._goal.goalSprite;
        const goalWidth = goal.width;
        const goalHeight = goal.height;
        const goalX = goal.x;
        const goalY = goal.y;
        
        console.log('🥅 Goal info:', {
            x: goalX,
            y: goalY,
            width: goalWidth,
            height: goalHeight
        });
        
        // Scale goalkeeper = 2/3 chiều cao goal
        const targetHeight = goalHeight * (2 / 3);
        
        // Lấy bounds của spine để tính scale
        const spineBounds = this.spine.getLocalBounds();
        if (spineBounds && spineBounds.height > 0) {
            const scale = targetHeight / spineBounds.height;
            this.spine.scale.set(scale, scale);
        }
        
        // Đặt goalkeeper tại giữa goal (center X, bottom Y)
        const centerX = goal.x;
        const bottomY = goalY + goalHeight; 
        
        this.setInitialPosition(centerX, bottomY);
    }

    public CheckBounds() {
        const margin = 200; // Khoảng cách từ cột dọc vào trong (đơn vị logic)
        const leftLimit = BASE_WIDTH / 2 - margin;
        const rightLimit = BASE_WIDTH / 2 + margin;

        if (this.x < leftLimit) {
            this.x = leftLimit;
            this.velocity.x = 0;
        } else if (this.x > rightLimit) {
            this.x = rightLimit;
            this.velocity.x = 0;
        }
    }
    //#endregion

    //#region  catch ball
    public TimetoCatchBall(targetX: number, targetY: number, jumpForce: number, horizontalSpeed: number = 5): number {
        let JumpAnimationTime = 0;
        if (this.spine && this.spine.skeleton) {
            const jumpAnim = this.spine.skeleton.data.findAnimation('Jump');
            if (jumpAnim) {
                JumpAnimationTime = jumpAnim.duration; // Thời gian chạy animation Jump
            }
        }

        // 1. Tính thời gian di chuyển ngang (vx)
        const distDeltaX = Math.abs(targetX - this.x);
        const timeToX = horizontalSpeed > 0 ? (distDeltaX / horizontalSpeed) / 60 : 0;

        // 2. Tính thời gian di chuyển dọc (vy)
        const Force = (jumpForce !== undefined) ? jumpForce : this.jump; 
        const timeToY = (Force / this.gravity) / 60; // Công thức v/g dựa trên 60 FPS

        // Thủ môn cần hoàn thành cả 2 việc: bay lên đủ cao VÀ bay xa đủ tầm
        const physicsTimeSeconds = Math.max(timeToX, timeToY);
        
        console.log(`⏱️ AI Estimate: Anim(${JumpAnimationTime.toFixed(2)}s) + Phys(${physicsTimeSeconds.toFixed(2)}s)`);
        return JumpAnimationTime + physicsTimeSeconds;
    }
    private getJumpForceForCase(action: GoalkeeperAction): number {
        switch (action) {
            case GoalkeeperAction.Case2: return 15; // Nhảy thẳng cao
            case GoalkeeperAction.Case3: return 13; // Trái vừa
            case GoalkeeperAction.Case4: return 13; // Phải vừa
            case GoalkeeperAction.Case5: return 18; // Trái cao
            case GoalkeeperAction.Case6: return 18; // Phải cao
            case GoalkeeperAction.Case7: return 8; // Trái thấp
            case GoalkeeperAction.Case8: return 8; // Phải thấp
            case GoalkeeperAction.Case9: return 18; // Trái rất cao
            case GoalkeeperAction.Case10: return 18; // Phải rất cao
            default: return 0;
        }
    }

    public calculateMaxY(action: GoalkeeperAction): number {
        const force = this.getJumpForceForCase(action);
        if (force === 0) return this._initialPosition.y;
        const jumpHeight = (force * force) / (2 * this.gravity);
        return this._initialPosition.y - jumpHeight;
    }
    /**
     * @param targetX 
     * @param targetY 
     */
    public checkBestCaseForHeight(targetX: number, targetY: number) {
        if (this.isDiving || this.isFallen || this.isPrepared) return;

        const CenterX =   BASE_WIDTH / 2; 
        const threshold = 90;
        let candidateActions: GoalkeeperAction[] = [];

        if (targetX < CenterX - threshold) {

            candidateActions = [
                GoalkeeperAction.Case3, 
                GoalkeeperAction.Case5, 
                GoalkeeperAction.Case7, 
                GoalkeeperAction.Case9, 
                GoalkeeperAction.Case2  
            ];
        } else if (targetX > CenterX + threshold) {
            
            candidateActions = [
                GoalkeeperAction.Case4,
                GoalkeeperAction.Case6,
                GoalkeeperAction.Case8,
                GoalkeeperAction.Case10,
                GoalkeeperAction.Case2
            ];
        } else {
            
            candidateActions = [
                GoalkeeperAction.Case2, 
                GoalkeeperAction.Case3, 
                GoalkeeperAction.Case4  
            ];
        }
        let bestAction: GoalkeeperAction | null = null;
        let minDiff = Infinity;

        for (const action of candidateActions) {

            const peakY = this.calculateMaxY(action);

            const diff = Math.abs(peakY - targetY);


            if (diff < minDiff) {
                minDiff = diff;
                bestAction = action;
            }
        }

        if (bestAction) {
            console.log(`✅ AI CHỐT ĐƠN: ${bestAction} (Độ lệch chỉ ${minDiff.toFixed(0)}px)`);
            this.PerformFall(bestAction);
        }
    }

    public setTargetBall(ballGame: any) {
        this._targetBall = ballGame;
    }

    public getActionFromZone(zoneIndex: number): GoalkeeperAction | null {
        switch (zoneIndex) {
            case 1: return GoalkeeperAction.Case3; // Ô 1 -> Case 5
            case 2: 
                // Ô 2: Random Case 2 hoặc Case 9
                return Math.random() > 0.5 ? GoalkeeperAction.Case2 : GoalkeeperAction.Case9;
            case 3: 
                // Ô 3: Random Case 2 hoặc Case 10
                return Math.random() > 0.5 ? GoalkeeperAction.Case2 : GoalkeeperAction.Case10;
            case 4: return GoalkeeperAction.Case4; // Ô 4 -> Case 6
            case 5: return GoalkeeperAction.Case7; // Ô 5 -> Case 7
            case 6: return GoalkeeperAction.Case5; // Ô 6 -> Case 3
            case 7: return GoalkeeperAction.Case6; // Ô 7 -> Case 4
            case 8: return GoalkeeperAction.Case8; // Ô 8 -> Case 8
            default: return null;
        }
    }

    //#region AI to catch ball
    private updateAI() {
    if (!this._targetBall || !this._targetBall.isFlying || this._targetBall.isNetAnim) return;
    if (this._hasAIActed || this.isDiving || this.isFallen || this.isPrepared) return;

        // Lấy snap ở scale 0.42 (xa hơn để ball ở ĐÚNG vị trí goal frame)
        const prediction = this._targetBall.getSnap(0.38);

        if (prediction && this._goal) {
            const collisionChecker = new BallCollision();

            const fakeBall = {
                ball: {
                    // prediction.x và y từ getSnap() đã được tính là tọa độ màn hình
                    getGlobalPosition: () => ({ x: prediction.x, y: prediction.y })
                },
                width: 145 * 0.38 // Bán kính bóng tại thời điểm tới khung thành (scale 0.42)
            };

            const zoneIndex = collisionChecker.checkTargetZone(fakeBall, this._goal);
            let bestAction = this.getActionFromZone(zoneIndex);

            // MISS LOGIC: 15% bắt hụt, 85% bắt trúng
            const missChance = Math.random();
            const isMiss = missChance < 1;

            if (bestAction) {
                // Nếu bắt hụt → random case 2-10 (trừ case đúng)
                if (isMiss) {
                    const allCases = [
                        GoalkeeperAction.Case2,
                        GoalkeeperAction.Case3,
                        GoalkeeperAction.Case4,
                        GoalkeeperAction.Case5,
                        GoalkeeperAction.Case6,
                        GoalkeeperAction.Case7,
                        GoalkeeperAction.Case8,
                        GoalkeeperAction.Case9,
                        GoalkeeperAction.Case10
                    ];

                    // Lọc bỏ case đúng
                    const wrongCases = allCases.filter(c => c !== bestAction);

                    // Random 1 case sai
                    const randomWrongCase = wrongCases[Math.floor(Math.random() * wrongCases.length)];

                    console.log(`❌ MISS! (${(missChance * 100).toFixed(1)}%) - Correct: ${bestAction}, Random wrong: ${randomWrongCase}`);
                    bestAction = randomWrongCase;
                } else {
                    console.log(`✅ CATCH! (${(missChance * 100).toFixed(1)}%) - Using correct case: ${bestAction}`);
                }

                const vy = this.getJumpForceForCase(bestAction);
                const myActionTime = this.TimetoCatchBall(prediction.x, prediction.y, vy);
                const timeToBall = prediction.timeFrames / 60;

                console.log(`⏱️ Timing Check - Zone: ${zoneIndex}, Ball: ${timeToBall.toFixed(2)}s, Action: ${myActionTime.toFixed(2)}s, Buffer: 0.3s`);

                // Tăng buffer từ 0.15s → 0.3s để trigger sớm hơn
                if (timeToBall <= myActionTime + 0.3) {
                    this.PerformFall(bestAction);
                    this._hasAIActed = true;
                    console.log(`🧤 Goalkeeper executing Case ${bestAction}! (Zone ${zoneIndex})`);
                }
            } else {
                console.log(`❌ No action for zone ${zoneIndex}`);
            }
        }
    }


    //#region Ball down
    public reset() {
        if (!this.spine) return;

        this.x = this._initialPosition.x;
        this.y = this._initialPosition.y;

        this.isGrounded = true;
        this.isFallen = false;
        this.fallenTime = 0; // Reset fallen timer
        this.rotation = 0;
        this.velocity.x = 0;
        this.spine.rotation = 0;
        this.targetRotation = 0;
        this.spine.skeleton.scaleX = 1;
        this.isDiving = false;
        this.isPrepared = false;
        this._hasAIActed = false;


        try {
            this.spine.state.setAnimation(0, 'idle', true);
        } catch {}
    }

    destroy(options?: any) {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
    //#endregion
}
