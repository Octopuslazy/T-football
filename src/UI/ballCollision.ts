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

    constructor() {
        super();
        
    }

    //#region Check Collision
    public checkCollision(ball: BallGame, goal: Goal, goalkeeper?: Goalkeeper) {
        this.currentBall = ball;
        this.currentGoal = goal; 
        const currentScale = ball.visualScale;
        if (currentScale >= 0.43 && currentScale <= 0.5 && goalkeeper) {
            if (this.checkGoalKeeperCollision(ball, goalkeeper)) {
                return;
        }
    }



        if (currentScale < 0.4 && currentScale > 0.2) {
            this.activeCollision = true;
            // console.log('Checking Collision');
            // ballcollisionradius
            const ballcollision = this.ballradius * currentScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;

            // check left post    
            const LPost = goal.leftPost.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, LPost.x, LPost.y, LPost.width, LPost.height)) {
                const PostCenterX = LPost.x + LPost.width*0.5;
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

            // check crossbar
            const Crossbar = goal.crossbar.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, Crossbar.x, Crossbar.y, Crossbar.width, Crossbar.height)) {
                const CrossCenterY = Crossbar.y + Crossbar.height*0.5;
                console.log('Collision Crossbar');
                if (ballY > CrossCenterY) {
                    this.Col_Cross_In();
                    this.state = CollisioneState.CROSS_IN;
                } else {
                    this.Col_Cross_Out();
                    this.state = CollisioneState.CROSS_OUT;
                } return;
            }
        } else {
            this.activeCollision = false;
            this.state = CollisioneState.NONE;
        }

        // check net collision
        if (currentScale < 0.4 &&  currentScale > 0.19) {
            if (this.state === CollisioneState.KEEPER_SAVED) return;
            if (this.state === CollisioneState.POST_IN) return;
            if (this.state === CollisioneState.CROSS_IN) return;
            if (this.state === CollisioneState.REACH_NET) return;
            if (this.state === CollisioneState.POST_OUT) return;
            

            const netBounds = goal.netSprite.getBounds();
            const ballcollision = this.ballradius * currentScale*0.89;
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
            if (isFullyInside) {
                console.log('ball in net');
                const lowestNetY = (netBounds.y + netBounds.height*0.9) - ballcollision;
                const LPost = goal.leftPost.getBounds();
                const RPost = goal.rightPost.getBounds();
                const minX = LPost.x + LPost.width + ballcollision;
                const maxX = RPost.x - ballcollision;
                const targetGlobalX = Math.random() * (maxX - minX) + minX;
                const impactForce = Math.abs(ball.vy) + Math.abs(ball.vz * 0.02);
                ball.onNetCatch(targetGlobalX, lowestNetY, impactForce);
                const minLocal = ball.toLocal(new Point(minX, 0)).x;
                const maxLocal = ball.toLocal(new Point(maxX, 0)).x;
                ball.setNetLimit(minLocal, maxLocal);
                this.state = CollisioneState.REACH_NET;

                this.Col_Reach_Net();
                return;
            }
            
    }}

    public checkGoalKeeperCollision(ball: BallGame, goalkeeper: Goalkeeper): boolean {
        const ballcollision = this.ballradius * ball.visualScale;
        const ballGlobal = ball.ball.getGlobalPosition();
        const ballX = ballGlobal.x;
        const ballY = ballGlobal.y;

        const keeperBounds = goalkeeper.getBounds();
        
        // Sử dụng core bounds giống như trong hitbox debug
        const coreWidth = keeperBounds.width * 0.5;
        const coreHeight = keeperBounds.height * 0.8;
        const centerX = keeperBounds.x + keeperBounds.width / 2;
        const centerY = keeperBounds.y + keeperBounds.height / 2;
        
        const expandedBounds = {
            x: centerX - coreWidth / 2 - 5,
            y: centerY - coreHeight / 2 - 5,
            width: coreWidth + 10,
            height: coreHeight + 10
        };
        
        if (this.isCircleRect(ballX, ballY, ballcollision, expandedBounds.x, expandedBounds.y, expandedBounds.width, expandedBounds.height)) {
            console.log('Collision Goalkeeper Saved');
            this.Col_Keeper_Saved();
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
        this.INGoal(this.currentGoal, this.currentBall);

        
        console.log('Left Post In Collision Handled');
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
        this.INGoal(this.currentGoal, this.currentBall);
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
        this.INGoal(this.currentGoal, this.currentBall);
    }
    public Col_Cross_Out() {
        if (this.activeCollision === false) return;
        this.activeCollision = true;
        const Vx = 0;
        const Vy = -50;
        const Vz = -1800;

        this.currentBall.reboundBall(Vx, Vy, Vz);
        console.log('Crossbar Out Collision Handled');
    }
    public Col_Keeper_Saved() {
        if (this.activeCollision === false) return;
        console.log('Goalkeeper Saved Collision Handled');

        const randomDirection = Math.random() < 0.5 ? -1 : 1;
        const Vx = randomDirection * (50 + Math.random() * 50);
        const Vy = -30 - Math.random() * 20;
        const Vz = -100 - Math.random() * 50;

        this.currentBall.reboundBall(Vx, Vy, Vz);
        this.activeCollision = true;

       
    }
    public Col_Reach_Net() {
        if (this.activeCollision === false) return;
        console.log('cham bong roi ne');
        this.resetCollision();
        
    }  
    //#endregion
    

    private resetCollision() {
        this.activeCollision = false;
        this.state = CollisioneState.NONE;

    }
    public INGoal(goal: Goal, ball: BallGame) {
        if (this.state === CollisioneState.POST_OUT) return;
        if (this.state === CollisioneState.CROSS_OUT) return;
        if (this.state === CollisioneState.REACH_NET) return;       
        if (this.state === CollisioneState.KEEPER_SAVED) return;
            const currentScale = ball.visualScale;
            const netBounds = goal.netSprite.getBounds();
            const ballcollision = this.ballradius * currentScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;
            if (this.isCircleRect(ballX, ballY, ballcollision, netBounds.x, netBounds.y, netBounds.width, netBounds.height)) {
                console.log('ball in net');
                const lowestNetY = (netBounds.y + netBounds.height*0.9) - ballcollision;
                const LPost = goal.leftPost.getBounds();
                const RPost = goal.rightPost.getBounds();
                const minX = LPost.x + LPost.width + ballcollision;
                const maxX = RPost.x - ballcollision;
                const targetGlobalX = Math.random() * (maxX - minX) + minX;
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