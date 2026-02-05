import { Container } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import Goal from './goal';
import { BASE_WIDTH } from '../constant/global';

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

    private speed: number = 10;
    private jump: number = 19;
    private gravity: number = 0.8;
    private fallen: number = 10;
    private targetRotation: number = 0;
    private rotationSpeed: number = 0.11;
    private isPrepared: boolean = false;
    private _targetBall: any = null; 
    private _hasAIActed: boolean = false;

    constructor() {
        super();2

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
            return this.spine.state.setAnimation(0, animationName, loop);
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
        const centerX = goalX;
        const bottomY = goalY + goalHeight; 
        
        this.setInitialPosition(centerX, bottomY);
    }

    public CheckBounds() {
        const margin = (300/1080)*window.innerWidth;
        const screenW = window.innerWidth;
        if (this.x < margin) {
            this.x = margin;
            this.velocity.x = 0;
        } else if (this.x > screenW - margin) {
            this.x = screenW - margin;
            this.velocity.x = 0;
        }
    }
    //#endregion

    //#region  catch ball
    public TimetoCatchBall(targetX: number, targetY: number, jumpForce: number = 0) {
        let JumpAnimationTime = 0;
        if (this.spine && this.spine.skeleton) {
            const jumpAnim = this.spine.skeleton.data.findAnimation( 'Jump');
            if (jumpAnim) {
                JumpAnimationTime = jumpAnim.duration;
            }
        }
        const Force = (jumpForce !== undefined)? jumpForce : this.jump; 
        const physicsTime = (Force / this.gravity) / 60;
        console.log('⏱️ Time to catch ball:', JumpAnimationTime + physicsTime);
        return JumpAnimationTime + physicsTime;

        // tobecontinued...
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

        const CenterX = BASE_WIDTH / 2; 
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


    private updateAI() {

        if (!this._targetBall || !this._targetBall.isFlying || this._targetBall.isNetAnim) return;
        if (this._hasAIActed || this.isDiving || this.isFallen || this.isPrepared) return;

        // Dự đoán vị trí bóng tại Scale 0.4
        const prediction = this._targetBall.getSnap(0.4);

        if (prediction) {

            const myActionTime = this.TimetoCatchBall(0, 0, 20);
            const timeToBall = prediction.timeFrames / 60;
            if (timeToBall <= myActionTime + 0.1) {
                this.checkBestCaseForHeight(prediction.x, prediction.y);
                this._hasAIActed = true;
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
