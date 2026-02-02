import {BallGame} from "./ball";
import {Container, Graphics, Point, Ticker, FederatedPointerEvent} from "pixi.js";
import { BASE_WIDTH, BASE_HEIGHT } from "../constant/global";
import Goal from "./goal";

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
    constructor() {
        super();
        
    }
    public checkCollision(ball: BallGame, goal: Goal) { 
        const currentScale = ball.visualScale;
        if (currentScale < 0.6 && currentScale > 0.4) {
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
                const PostCenterX = LPost.x + LPost.width*0.8;
                console.log('Collision Left Post');
                if (ballX < PostCenterX) {
                    this.Col_Post_LEFT_Out();
                } else {
                    this.Col_Post_LEFT_In();
                } return;
            }

            // check right post
            const RPost = goal.rightPost.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, RPost.x, RPost.y, RPost.width, RPost.height)) {
                const PostCenterX = RPost.x + RPost.width*0.8;
                console.log('Collision Right Post');
                if (ballX > PostCenterX) {
                    this.Col_Post_RIGHT_In();
                } else {
                    this.Col_Post_RIGHT_Out();
                } return;
            }

            // check crossbar
            const Crossbar = goal.crossbar.getBounds();
            if (this.isCircleRect(ballX, ballY, ballcollision, Crossbar.x, Crossbar.y, Crossbar.width, Crossbar.height)) {
                const CrossCenterY = Crossbar.y + Crossbar.height*0.8;
                console.log('Collision Crossbar');
                if (ballY < CrossCenterY) {
                    this.Col_Cross_In();
                } else {
                    this.Col_Cross_Out();
                } return;
            }
        } else {
            this.activeCollision = false;
            
        }

        // check net collision
        if (currentScale < 0.4 &&  currentScale > 0.25) {
            const netBounds = goal.netSprite.getBounds();
            const ballcollision = this.ballradius * currentScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;
            if (this.isCircleRect(ballX, ballY, ballcollision, netBounds.x, netBounds.y, netBounds.width, netBounds.height)) {
                console.log('ball in net');
                const lowestNetY = (netBounds.y + netBounds.height) - ballcollision;
                const LPost = goal.leftPost.getBounds();
                const RPost = goal.rightPost.getBounds();
                const minX = LPost.x + LPost.width + ballcollision;
                const maxX = RPost.x - ballcollision;
                const targetGlobalX = Math.random() * (maxX - minX) + minX;
                ball.onNetCatch(targetGlobalX, lowestNetY);
                this.Col_Reach_Net();
                return;
            }
    }}
    public isCircleRect(cx: number, cy: number, radius: number, rx: number, ry: number, rw: number, rh: number): boolean {
        const testX = Math.max(rx, Math.min(cx, rx + rw));
        const testY = Math.max(ry, Math.min(cy, ry + rh));
        const distX = cx - testX;
        const distY = cy - testY;
        const distanceSq = (distX * distX) + (distY * distY);
        return distanceSq <= (radius * radius);
        
    }   
    public Col_Post_LEFT_In() {
        if (this.activeCollision === false) return;
        console.log('Left Post In Collision Handled');
    }  
    public Col_Post_LEFT_Out() {
        if (this.activeCollision === false) return;
        console.log('Left Post Out Collision Handled');
    }
    public Col_Post_RIGHT_In() {
        if (this.activeCollision === false) return;
    }
    public Col_Post_RIGHT_Out() {
        if (this.activeCollision === false) return;
    }
    public Col_Cross_In() {
        if (this.activeCollision === false) return;
    }
    public Col_Cross_Out() {
        if (this.activeCollision === false) return;
    }
    public Col_Keeper_Saved() {
        if (this.activeCollision === false) return;
    }
    public Col_Reach_Net() {
        if (this.activeCollision === false) return;
        console.log('cham bong roi ne');
    }  
              

}