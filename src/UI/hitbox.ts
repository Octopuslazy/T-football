import { Container, Graphics, Point } from "pixi.js";
import { BallGame } from "./ball";
import Goalkeeper from "./goalkeeper";

export class HitboxDebug extends Container {
    private ballHitbox: Graphics;
    private keeperHitbox: Graphics;
    private keeperExpandedHitbox: Graphics;
    private debugMode: boolean = true;
    private ballRadius: number = 125;

    constructor() {
        super();
        
        // Initialize debug graphics
        this.ballHitbox = new Graphics();
        this.keeperHitbox = new Graphics();
        this.keeperExpandedHitbox = new Graphics();
        
        this.addChild(this.ballHitbox);
        this.addChild(this.keeperHitbox);
        this.addChild(this.keeperExpandedHitbox);
        
        // Set initial visibility
        this.visible = this.debugMode;
    }

    public drawBallHitbox(ball: BallGame): void {
        if (!this.debugMode) return;

        this.ballHitbox.clear();
        
        try {
            const ballCollision = this.ballRadius * ball.visualScale;
            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;

            

            // Draw ball collision circle
            this.ballHitbox.lineStyle(3, 0x00FF00, 0); // Green circle
            this.ballHitbox.drawCircle(ballX, ballY, ballCollision);
            
            // Draw center point
            this.ballHitbox.lineStyle(0);
            this.ballHitbox.beginFill(0x00FF00, 0);
            this.ballHitbox.drawCircle(ballX, ballY, 3);
            this.ballHitbox.endFill();
        } catch (error) {
            console.error('Error drawing ball hitbox:', error);
        }
    }

    public drawGoalkeeperHitbox(goalkeeper: Goalkeeper, ballScale: number): void {
        if (!this.debugMode) return;

        this.keeperHitbox.clear();
        this.keeperExpandedHitbox.clear();

        try {
            const keeperBounds = goalkeeper.getBounds();
            
            // Tạo hitbox nhỏ hơn, chỉ bao quanh phần thân chính
            const coreWidth = keeperBounds.width * 0.5; // Giảm width xuống 50%
            const coreHeight = keeperBounds.height * 0.8; // Giảm height xuống 80%
            const centerX = keeperBounds.x + keeperBounds.width / 2;
            const centerY = keeperBounds.y + keeperBounds.height / 2;
            
            const coreBounds = {
                x: centerX - coreWidth / 2,
                y: centerY - coreHeight / 2,
                width: coreWidth,
                height: coreHeight
            };
            
            // Original keeper core bounds (blue)
            this.keeperHitbox.lineStyle(3, 0x0000FF, 1);
            this.keeperHitbox.drawRect(
                coreBounds.x, 
                coreBounds.y, 
                coreBounds.width, 
                coreBounds.height
            );

            // Expanded collision bounds nhỏ (red) - chỉ expand một chút từ core
            const expandedBounds = {
                x: coreBounds.x - 5,
                y: coreBounds.y - 5,
                width: coreBounds.width + 10,
                height: coreBounds.height + 10
            };

            this.keeperExpandedHitbox.lineStyle(2, 0xFF0000, 1);
            this.keeperExpandedHitbox.drawRect(
                expandedBounds.x, 
                expandedBounds.y, 
                expandedBounds.width, 
                expandedBounds.height
            );

            // Draw center point
            this.keeperHitbox.lineStyle(0);
            this.keeperHitbox.beginFill(0x0000FF, 0);
            this.keeperHitbox.drawCircle(centerX, centerY, 2);
            this.keeperHitbox.endFill();

        } catch (error) {
            console.warn('Error drawing goalkeeper hitbox:', error);
        }
    }

    public drawCollisionCheck(ball: BallGame, goalkeeper: Goalkeeper): boolean {
        if (!this.debugMode) return false;

        const ballCollision = this.ballRadius * ball.visualScale;
        const ballGlobal = ball.ball.getGlobalPosition();
        const ballX = ballGlobal.x;
        const ballY = ballGlobal.y;

        try {
            const keeperBounds = goalkeeper.getBounds();
            
            // Tạo core bounds giống như trong drawGoalkeeperHitbox
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

            // Check collision với core bounds
            const isColliding = this.isCircleRect(
                ballX, ballY, ballCollision,
                expandedBounds.x, expandedBounds.y,
                expandedBounds.width, expandedBounds.height
            );

            // Draw connection line if colliding
            if (isColliding) {
                this.ballHitbox.lineStyle(5, 0xFFFF00, 1); // Yellow line
                this.ballHitbox.moveTo(ballX, ballY);
                this.ballHitbox.lineTo(centerX, centerY);
            }

            return isColliding;
        } catch (error) {
            console.warn('Error checking collision:', error);
            return false;
        }
    }

    private isCircleRect(cx: number, cy: number, radius: number, 
                        rx: number, ry: number, rw: number, rh: number): boolean {
        const distX = Math.abs(cx - rx - rw / 2);
        const distY = Math.abs(cy - ry - rh / 2);

        if (distX > (rw / 2 + radius)) return false;
        if (distY > (rh / 2 + radius)) return false;

        if (distX <= (rw / 2)) return true;
        if (distY <= (rh / 2)) return true;

        const cornerDistance = Math.pow(distX - rw / 2, 2) + Math.pow(distY - rh / 2, 2);
        return cornerDistance <= Math.pow(radius, 2);
    }

    public clearHitboxes(): void {
        this.ballHitbox.clear();
        this.keeperHitbox.clear();
        this.keeperExpandedHitbox.clear();
    }

    public toggleDebugMode(enabled?: boolean): void {
        this.debugMode = enabled !== undefined ? enabled : !this.debugMode;
        this.visible = this.debugMode;
        
        if (!this.debugMode) {
            this.clearHitboxes();
        }
        
        console.log(`🎯 Hitbox Debug: ${this.debugMode ? 'ON' : 'OFF'}`);
    }

    public isDebugMode(): boolean {
        return this.debugMode;
    }

    // Update method để gọi mỗi frame
    public update(ball: BallGame, goalkeeper: Goalkeeper): void {
        if (!this.debugMode) return;

        const currentScale = ball.visualScale;
        
        // Hiển thị hitbox liên tục khi debug mode bật
        if (ball && goalkeeper) {
            this.drawBallHitbox(ball);
            this.drawGoalkeeperHitbox(goalkeeper, currentScale);
            
            // Chỉ check collision khi trong range
            if (currentScale >= 0.42 && currentScale <= 0.5) {
                this.drawCollisionCheck(ball, goalkeeper);
            }
        }
    }
}