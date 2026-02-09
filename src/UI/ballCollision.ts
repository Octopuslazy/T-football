import {BallGame} from "./ball";
import {Container, Graphics, Point, Ticker, FederatedPointerEvent} from "pixi.js";
import { BASE_WIDTH, BASE_HEIGHT } from "../constant/global";
import Goal from "./goal";
import Goalkeeper, { GoalkeeperAction } from "./goalkeeper";

enum CollisioneState {
    NONE = 'NONE',
    POST_IN = 'POST_IN',
    POST_OUT = 'POST_OUT',
    CROSS_IN = 'CROSS_IN',
    CROSS_OUT = 'CROSS_OUT',
    KEEPER_SAVED = 'KEEPER_SAVED',
    REACH_NET = 'REACH_NET'
}



export class BallCollision extends Container {
    private activeCollision: boolean = false;
    private ballradius: number = 125;
    public state: CollisioneState = CollisioneState.NONE;

    public minX: number = 0;
    public maxX: number = 0;

    private currentBall!: BallGame;
    private currentGoal!: Goal;

    private ballComing: boolean = false;

    private currentGoalkeeper!: Goalkeeper;
    private isKeeperSaved: boolean = false;
    private isKeeperProcessing: boolean = false;

    private netResetTimer: any = null;
    private scaleY: number = 1;

    private isfirtCollision: boolean = true;
    private shootId: number = 0; // Unique ID cho mỗi lần bắn để tránh race condition
    private isBallBehindGoal: boolean = false; // Track if ball passed behind goal

    constructor() {
        super();
        
        this.scaleY = screen.height / BASE_HEIGHT;
        
    }

    //#region Check Collision
    public checkCollision(ball: BallGame, goal: Goal, goalkeeper?: Goalkeeper) {
        this.currentBall = ball;
        this.currentGoal = goal;
        const currentScale = ball.visualScale;

        // Auto-reset collision state when starting new shot (ball at starting position)
        if (currentScale >= 0.95 && this.isBallBehindGoal) {
            console.log('🔄 Auto-reset collision state for new shot');
            this.resetCollision();
        }

        //set layer
        if (goalkeeper) {
            this.UpdateLayer(ball, goalkeeper);
        }

        // Block collision if ball is above crossbar and passed collision zone
        if (currentScale < 0.36 && this.currentGoal) {
            const ballGlobal = ball.ball.getGlobalPosition();
            const crossbarBounds = this.currentGoal.crossbar.getBounds();
            if (ballGlobal.y < crossbarBounds.y) {
                // Ball is above crossbar - mark as behind goal and block collision
                this.isBallBehindGoal = true;
                return;
            }
        }

        // Also block if ball was already marked as behind goal
        if (this.isBallBehindGoal) {
            return;
        }

        // keeper saved
        if (currentScale < 0.42 || currentScale > 0.5) {
            this.isKeeperProcessing = false; // Reset flag
            this.isKeeperSaved = false;
        }
        // DEBUG: Mở rộng range và thêm logging
        if (currentScale >= 0.36 && currentScale <= 0.48 && goalkeeper && !this.isKeeperProcessing) {
            
            if (this.checkGoalKeeperCollision(ball, goalkeeper)) {
                
                this.isKeeperProcessing = true;
                return;
            } else {
                
            }
        }
        if (this.isKeeperSaved) {
            return;
        }



        if (currentScale < 0.36 && currentScale > 0.19) {
            this.activeCollision = true;
            // console.log('Checking Collision');

            
            // ballcollisionradius
            const ballcollision = this.ballradius * currentScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;

            // check crossbar
            const Crossbar = goal.crossbar.getBounds();
            const crossbarcheckX = Crossbar.x * 0.7;
            const CRX = Crossbar.x + (Crossbar.width - crossbarcheckX) * 0.5;
            if (this.isCircleRect(ballX, ballY, ballcollision, CRX, Crossbar.y, crossbarcheckX, Crossbar.height)) {
                if (this.state === CollisioneState.CROSS_IN) return;
                if (this.state === CollisioneState.REACH_NET) return;
                const CrossCenterY = Crossbar.y + Crossbar.height*0.7;
                console.log('Collision Crossbar');
                if (ballY > CrossCenterY) {
                    this.Col_Cross_In();
                    this.state = CollisioneState.CROSS_IN;
                    ball.isPost = true;
                } else {
                    this.Col_Cross_Out();
                    this.state = CollisioneState.CROSS_OUT;
                } return;
            }

            // check left post
            const LPost = goal.leftPost.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, LPost.x, LPost.y, LPost.width, LPost.height)) {
                if (this.state === CollisioneState.POST_IN) return;
                if (this.state === CollisioneState.REACH_NET) return;
                const PostCenterX = LPost.x + LPost.width;
                console.log('Collision Left Post');
                if (ballX < PostCenterX) {
                    this.Col_Post_LEFT_Out();
                    this.state = CollisioneState.POST_OUT;
                } else {
                    this.Col_Post_LEFT_In();
                    this.state = CollisioneState.POST_IN;
                } return;
            }

            // check right post
            const RPost = goal.rightPost.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, RPost.x, RPost.y, RPost.width, RPost.height)) {
                if (this.state === CollisioneState.POST_IN) return;
                if (this.state === CollisioneState.REACH_NET) return;
                const PostCenterX = RPost.x - RPost.width*0.5;
                console.log('Collision Right Post');
                if (ballX < PostCenterX) {
                    this.Col_Post_RIGHT_In();
                    this.state = CollisioneState.POST_IN;
                } else {
                    this.Col_Post_RIGHT_Out();
                    this.state = CollisioneState.POST_OUT;
                } return;
            }


            if (!this.isKeeperSaved && this.isfirtCollision && !ball.isPost) {
                if (this.state === CollisioneState.POST_IN) return;
                if (this.state === CollisioneState.CROSS_IN) return;
                if (this.state === CollisioneState.REACH_NET) return;
                if (this.state === CollisioneState.POST_OUT) return;

                const netBounds = goal.netSprite.getBounds();
                const ballcollision = this.ballradius * currentScale * 0.89;
                const ballGlobal = ball.ball.getGlobalPosition();
                const ballX = ballGlobal.x;
                const ballY = ballGlobal.y;

                const bleft = ballX - ballcollision;
                const bright = ballX + ballcollision;
                const btop = ballY - ballcollision;
                const bbottom = ballY + ballcollision;

                const nleft = netBounds.x;
                const nright = (netBounds.x + netBounds.width);
                const ntop = netBounds.y;
                const nbottom = (netBounds.y + netBounds.height);
                const isFullyInside =
                    bleft >= nleft &&
                    bright <= nright &&
                    btop >= ntop &&
                    bbottom <= nbottom;

                

                if (isFullyInside && !ball.isPost) {
                    this.isfirtCollision = false; // ✓ Set thành false sau khi va chạm
                    console.log('⚽ Ball in net - direct shot (no post collision)');
                    const lowestNetY = (netBounds.y + netBounds.height * 0.9) - ballcollision * (screen.height / BASE_HEIGHT);
                    const LPost = goal.leftPost.getBounds();
                    const RPost = goal.rightPost.getBounds();
                    const minX = LPost.x + LPost.width + ballcollision;
                    const maxX = RPost.x - ballcollision;
                    // Dựa vào vị trí bóng thực tế, clamp trong khoảng giữa 2 cột
                    const targetGlobalX = Math.max(minX, Math.min(maxX, ballX));
                    const impactForce = Math.abs(ball.vy) + Math.abs(ball.vz * 0.02);
                    ball.onNetCatch(targetGlobalX, lowestNetY, impactForce);
                    const minLocal = ball.toLocal(new Point(minX, 0)).x;
                    const maxLocal = ball.toLocal(new Point(maxX, 0)).x;
                    ball.setNetLimit(minLocal, maxLocal);
                    this.state = CollisioneState.REACH_NET;

                    this.Col_Reach_Net();
                    return;
                }
            }
        } else {
            this.activeCollision = false;
            this.state = CollisioneState.NONE;
        }
    } // Đóng function checkCollision()

    public checkGoalKeeperCollision(ball: BallGame, goalkeeper: Goalkeeper): boolean {

        const ballcollision = this.ballradius * ball.visualScale;
        const ballGlobal = ball.ball.getGlobalPosition();
        const ballX = ballGlobal.x;
        const ballY = ballGlobal.y;

        const keeperBounds = goalkeeper.getBounds();

        // Mở rộng collision bounds để dễ bắt hơn
        const coreWidth = keeperBounds.width * 0.7; // Tăng từ 0.5 → 0.7
        const coreHeight = keeperBounds.height * 0.9; // Tăng từ 0.8 → 0.9
        const centerX = keeperBounds.x + keeperBounds.width / 2;
        const centerY = keeperBounds.y + keeperBounds.height / 2;

        const expandedBounds = {
            x: centerX - coreWidth / 2 - 10, // Tăng margin từ 5 → 10
            y: centerY - coreHeight / 2 - 10,
            width: coreWidth + 20, // Tăng từ 10 → 20
            height: coreHeight + 20
        };


        if (this.isCircleRect(ballX, ballY, ballcollision, expandedBounds.x, expandedBounds.y, expandedBounds.width, expandedBounds.height)) {
            
            if (!this.isKeeperProcessing) {
                this.Col_Keeper_Saved();
            }
            this.state = CollisioneState.KEEPER_SAVED;
            return true;
        }
        return false;
    }

    public isCircleRect(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number): boolean {
        const testX = Math.max(rx, Math.min(cx, rx + rw));
        const testY = Math.max(ry, Math.min(cy, ry + rh));
        const distX = cx - testX;
        const distY = cy - testY;
        const distanceSq = (distX * distX) + (distY * distY);
        return distanceSq <= (radius * radius);
        
    } 


    //#region Collision Handlers
    public Col_Post_LEFT_In() {
        if (this.activeCollision === false) return;
        if (this.state === CollisioneState.KEEPER_SAVED) return;
        if (this.state === CollisioneState.REACH_NET) return;

        this.activeCollision = true;

        // Rebound nhẹ về bên phải để bóng di chuyển mượt trước khi vào lưới
        const Vx = 30 + Math.random() * 20; // 30 đến 50
        const Vy = -35 - Math.random() * 15; // -25 đến -40
        const Vz = -20 - Math.random() * 15; // -20 đến -35

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.ballComing = true;
        console.log('Left Post In - Rebound then transition to net');

        // Increment shootId để tránh race condition
        const currentShootId = ++this.shootId;
        const ball = this.currentBall;
        const goal = this.currentGoal;

        setTimeout(() => {
            try {
                // Chỉ gọi INGoal nếu shootId vẫn khớp (không có lần bắn mới)
                if (this.shootId === currentShootId && ball?.isFlying && !ball?.isNetAnim) {
                    this.INGoal(goal, ball);
                }
            } catch (e) {
                console.error('INGoal error in Left Post In:', e);
            }
        }, 150);
    }  
    public Col_Post_LEFT_Out() {
        if (this.activeCollision) return;
        this.activeCollision = true;
        const Vx = -15 + Math.random() * -10;
        const Vy = -5;
        const Vz = -10;

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.ballComing = true;
        console.log('Left Post Out Collision Handled');
    }
    public Col_Post_RIGHT_In() {
        if (this.activeCollision === false) return;
        if (this.state === CollisioneState.KEEPER_SAVED) return;
        if (this.state === CollisioneState.REACH_NET) return;

        this.activeCollision = true;

        // Rebound nhẹ để bóng di chuyển mượt trước khi vào lưới
        const Vx = -30 - Math.random() * 20; // -30 đến -50
        const Vy = -45 - Math.random() * 15; // -25 đến -40
        const Vz = -20 - Math.random() * 15; // -20 đến -35

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.ballComing = true;
        console.log('Right Post In - Rebound then transition to net');

        // Increment shootId để tránh race condition
        const currentShootId = ++this.shootId;
        const ball = this.currentBall;
        const goal = this.currentGoal;

        setTimeout(() => {
            try {
                // Chỉ gọi INGoal nếu shootId vẫn khớp (không có lần bắn mới)
                if (this.shootId === currentShootId && ball?.isFlying && !ball?.isNetAnim) {
                    this.INGoal(goal, ball);
                }
            } catch (e) {
                console.error('INGoal error in Right Post In:', e);
            }
        }, 150);
    }
    public Col_Post_RIGHT_Out() {
        if (this.activeCollision === false) return;
        this.activeCollision = true;
        const Vx = 200 + 100*Math.random();
        const Vy = -50;
        const Vz = -40;

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.ballComing = true;
        console.log('Right Post Out Collision Handled');
    }
    public Col_Cross_In() {
        if (this.activeCollision === false) return;
        if (this.state === CollisioneState.KEEPER_SAVED) return;
        if (this.state === CollisioneState.REACH_NET) return;

        this.activeCollision = true;

        // Rebound xuống dưới để bóng di chuyển mượt trước khi vào lưới
        const Vx = this.currentBall.vx * 0.6; // Giữ 60% vận tốc ngang
        const Vy = -30 - Math.random() * 20; // -30 đến -50 (nảy xuống)
        const Vz = -25 - Math.random() * 15; // -25 đến -40

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.ballComing = true;
        console.log('Crossbar In - Rebound then transition to net');

        // Increment shootId để tránh race condition
        const currentShootId = ++this.shootId;
        const ball = this.currentBall;
        const goal = this.currentGoal;

        setTimeout(() => {
            try {
                // Chỉ gọi INGoal nếu shootId vẫn khớp (không có lần bắn mới)
                if (this.shootId === currentShootId && ball?.isFlying && !ball?.isNetAnim) {
                    this.INGoal(goal, ball);
                }
            } catch (e) {
                console.error('INGoal error in Crossbar In:', e);
            }
        }, 150);
    }
    public Col_Cross_Out() {
        if (this.isKeeperSaved || this.isKeeperProcessing) {
            return;
        }
        
        this.isKeeperSaved = true;
        this.isKeeperProcessing = true;
        this.currentBall.isKeeperSaved = true;
        
        const ballGlobal = this.currentBall.ball.getGlobalPosition();
        const goalCenterX = BASE_WIDTH / 2;
        
        const directionX = ballGlobal.x - goalCenterX;
        const bounceDirection = directionX > 0 ? 1 : -1; 
        
        const Vx = bounceDirection * (10 + Math.random() * 10); 
        const Vy = 110 - Math.random() * 20; 
        const Vz = -280 - Math.random() * 20; 
        
        
        // Apply velocities
        this.currentBall.vx = Vx;
        this.currentBall.vy = Vy;
        this.currentBall.vz = Vz;
        
        if (this.currentBall.z3d < 50) {
            this.currentBall.z3d = 50; 
        }
        
        this.currentBall.isFlying = true;
        this.currentBall.isNetAnim = false;
        
        this.state = CollisioneState.KEEPER_SAVED;
    }
    public Col_Keeper_Saved() {
        if (this.isKeeperSaved || this.isKeeperProcessing) {
            return;
        }
        
        this.isKeeperSaved = true;
        this.isKeeperProcessing = true;
        this.currentBall.isKeeperSaved = true;
        
        const ballGlobal = this.currentBall.ball.getGlobalPosition();
        const goalCenterX = BASE_WIDTH / 2;
        
        const directionX = ballGlobal.x - goalCenterX;
        const bounceDirection = directionX > 0 ? 1 : -1; 
        
        const Vx = bounceDirection * (20 + Math.random() * 20); 
        const Vy = 70 - Math.random() * 20; 
        const Vz = -80 - Math.random() * 20; 
        
        
        // Apply velocities
        this.currentBall.vx = Vx;
        this.currentBall.vy = Vy;
        this.currentBall.vz = Vz;
        
        if (this.currentBall.z3d < 50) {
            this.currentBall.z3d = 50; 
        }
        
        this.currentBall.isFlying = true;
        this.currentBall.isNetAnim = false;
        
        this.state = CollisioneState.KEEPER_SAVED;
    }
    public Col_Reach_Net() {
        if (this.activeCollision === false) return;
        console.log('cham bong roi ne');

        // Clear timer cũ trước khi tạo mới để tránh memory leak
        if (this.netResetTimer) {
            clearTimeout(this.netResetTimer);
            this.netResetTimer = null;
        }

        this.netResetTimer = setTimeout(() => {
            if (this.currentBall && this.currentBall.reset) {
                this.currentBall.reset('Ball reached net - auto reset after 1.5s');
                this.resetCollision();
            }
            this.netResetTimer = null;
        }, 1500);
    }
        
    
    //#endregion
    
    //#region setlayer handlers
    public UpdateLayer(ball: BallGame, goalkeeper: Goalkeeper) {
        if (!ball.parent || !goalkeeper.parent || ball.parent !== goalkeeper.parent) return;
        const currentScale = ball.visualScale;
        const parent = ball.parent;

        // Check if ball is above crossbar (y < crossbar.y means higher position)
        if (currentScale < 0.36 && this.currentGoal) {
            const ballGlobal = ball.ball.getGlobalPosition();
            const crossbarBounds = this.currentGoal.crossbar.getBounds();
            const ballY = ballGlobal.y;
            const crossbarY = crossbarBounds.y;

            // If ball is above crossbar, set it below goal and keeper
            if (ballY < crossbarY) {
                this.isfirtCollision = false; // Reset for next shot
                this.isBallBehindGoal = true; // Mark ball as behind goal

                const goalIndex = parent.getChildIndex(this.currentGoal);
                const keeperIndex = parent.getChildIndex(goalkeeper);
                const ballIndex = parent.getChildIndex(ball);



                // Find lowest index between goal and keeper
                const lowestIndex = Math.min(goalIndex, keeperIndex);

                // Set ball below both
                if (ballIndex >= lowestIndex) {

                    parent.setChildIndex(ball, Math.max(0, lowestIndex - 1));
                }
                return; // Exit early, don't run other layer logic
            }
        }

        // Original keeper layer logic when ball is in collision zone
        if (currentScale < 0.36 && !this.isKeeperSaved && !this.isKeeperProcessing) {
            const keeperIndex = parent.getChildIndex(goalkeeper);
            const ballIndex = parent.getChildIndex(ball);
            if (ballIndex > keeperIndex) {
                parent.setChildIndex(ball, Math.max(0, keeperIndex - 1));
            }
        } else {
            // Ball is in front - restore normal layer
            const keeperIndex = parent.getChildIndex(goalkeeper);
            const ballIndex = parent.getChildIndex(ball);
            if (ballIndex < keeperIndex) {
                parent.setChildIndex(ball, keeperIndex);
            }
        }
    }

    public resetCollision() {

        this.activeCollision = false;
        this.state = CollisioneState.NONE;
        this.ballComing = false;
        this.isKeeperSaved = false;
        this.isKeeperProcessing = false;
        this.isfirtCollision = true; // ✓ TRUE để sẵn sàng cho shot mới
        this.isBallBehindGoal = false; // ✓ Reset flag for next shot


        if (this.netResetTimer) {
            clearTimeout(this.netResetTimer);
            this.netResetTimer = null;
        }

        this.currentBall = null as any;

    }
    public INGoal(goal: Goal, ball: BallGame) {
        if (this.state === CollisioneState.POST_OUT) return;
        if (this.state === CollisioneState.CROSS_OUT) return;
        if (this.state === CollisioneState.REACH_NET) return;       
        if (this.state === CollisioneState.KEEPER_SAVED) return;
        
            this.isfirtCollision = true;
        // if (this.isfirtCollision === true) return;
            ball.isPost = true
            const currentScale = ball.visualScale;
            const netBounds = goal.netSprite.getBounds();
            const ballcollision = this.ballradius * currentScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;
            if (this.isCircleRect(ballX, ballY, ballcollision, netBounds.x, netBounds.y, netBounds.width, netBounds.height)) {
                
                console.log('simple check');
                const lowestNetY = (netBounds.y + netBounds.height*0.9) - ballcollision*(screen.height / BASE_HEIGHT);
                const LPost = goal.leftPost.getBounds();
                const RPost = goal.rightPost.getBounds();
                const minX = LPost.x + LPost.width + ballcollision;
                const maxX = RPost.x - ballcollision;
                // Dựa vào vị trí bóng thực tế, clamp trong khoảng giữa 2 cột
                const targetGlobalX = Math.max(minX, Math.min(maxX, ballX));
                const impactForce = Math.abs(ball.vz * 0.025);
                ball.onNetCatch(targetGlobalX, lowestNetY, impactForce);
                this.state = CollisioneState.REACH_NET;
                const minLocal = ball.toLocal(new Point(minX, 0)).x;
                const maxLocal = ball.toLocal(new Point(maxX, 0)).x;
                ball.setNetLimit(minLocal, maxLocal);

                this.Col_Reach_Net();
                return;
            }
    }
   

              

}