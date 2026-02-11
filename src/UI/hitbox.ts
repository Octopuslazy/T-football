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
            // SYNC VỚI ballCollision.ts line 226 - PHẢI GIỐNG HỆT!
            const ballCollisionRadius = this.ballRadius * ball.visualScale;

            const ballGlobal = ball.ball.getGlobalPosition();
            const ballX = ballGlobal.x;
            const ballY = ballGlobal.y;

            // Draw ball collision circle - match exact collision detection
            this.ballHitbox.lineStyle(3, 0x00FF00, 1); // Green circle - VISIBLE
            this.ballHitbox.drawCircle(ballX, ballY, ballCollisionRadius);

            // Draw center point
            this.ballHitbox.lineStyle(0);
            this.ballHitbox.beginFill(0x00FF00, 1); // Green center - VISIBLE
            this.ballHitbox.drawCircle(ballX, ballY, 5);
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

            // SYNC VỚI ballCollision.ts - PHẢI GIỐNG HỆT collision detection code!
            const coreWidth = keeperBounds.width * 0.5; // Match line 234 ballCollision.ts
            const coreHeight = keeperBounds.height * 0.7; // Match line 235 ballCollision.ts (was 0.8, now 0.7)
            const centerX = keeperBounds.x + keeperBounds.width / 2;
            const centerY = keeperBounds.y + keeperBounds.height / 2;

            // PHẢI GIỐNG ballCollision.ts expandedBounds (lines 239-244)
            const expandedBounds = {
                x: centerX - coreWidth / 2 - 5,
                y: centerY - coreHeight / 2 - 5,
                width: coreWidth + 10,
                height: coreHeight + 10
            };

            // Draw ONLY the RED expanded bounds - đây là collision thực tế!
            this.keeperExpandedHitbox.lineStyle(3, 0xFF0000, 1); // Red = actual collision
            this.keeperExpandedHitbox.drawRect(
                expandedBounds.x,
                expandedBounds.y,
                expandedBounds.width,
                expandedBounds.height
            );

            // Draw center point for reference
            this.keeperHitbox.lineStyle(0);
            this.keeperHitbox.beginFill(0xFF0000, 1); // Red center to match collision box
            this.keeperHitbox.drawCircle(centerX, centerY, 5);
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