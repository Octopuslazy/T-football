import { Container, Graphics, Point, Ticker, Sprite } from "pixi.js";
import { BASE_WIDTH, BASE_HEIGHT } from "../constant/global";
const CONFIG = {
    ballradius: 145,
};
var BallState;
(function (BallState) {
    BallState[BallState["Idle"] = 0] = "Idle";
    BallState[BallState["Flying"] = 1] = "Flying";
    BallState[BallState["Landing"] = 2] = "Landing";
})(BallState || (BallState = {}));
export class BallGame extends Container {
    constructor() {
        super();
        this.visualScale = 1;
        this.timescale = 1;
        this.state = BallState.Idle;
        this.hasLanched = false;
        this.curveForce = 0;
        // 3d 
        this.x3d = 0;
        this.y3d = 0;
        this.z3d = 0;
        // verlocity
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        //force
        this.fg = 0.98; // gravity
        this.fr = 0.96; // resistance
        //Rotation
        this.rotationSpeed = 0;
        //Net phase
        this.isNetAnim = false;
        this.netPhase = 'stopped';
        this.netTargetX = 0;
        this.netTargetY = 0;
        this.veTargetX = 0;
        this.veTargetY = 0;
        this.netMinX = -Infinity;
        this.netMaxX = Infinity;
        // state
        this.isFlying = false;
        this.initball();
        this.initshadow();
        this.initline();
        this.initball();
        // Input swipe
        this.SwipeData = { point: [], startTime: 0, isDown: false };
        this.eventMode = 'static';
        this.hitArea = { contains: () => true };
        // event
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointermove', this.onPointerMove.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerUp.bind(this));
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                this.reset();
            }
        });
        this.reset();
    }
    initball() {
        //ball handle
        if (this.ball) {
            this.ball.destroy({ children: true });
        }
        this.ball = new Container();
        const ballSprite = Sprite.from('/Assets/arts/ball.png');
        ballSprite.anchor.set(0.5);
        const ballwidth = CONFIG.ballradius * 2;
        const ballheight = CONFIG.ballradius * 2;
        ballSprite.width = ballwidth;
        ballSprite.height = ballheight;
        this.ball.addChild(ballSprite);
        this.addChild(this.ball);
    }
    initshadow() {
        // shadow handle
        this.shadow = new Graphics();
        this.shadow
            .ellipse(0, 0, CONFIG.ballradius * 0.8, CONFIG.ballradius * 0.2)
            .fill(0xffffff)
            .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        this.addChild(this.shadow);
    }
    initline() {
        // line handle
        this.line = new Graphics();
        this.line.alpha = 0.4;
        this.addChild(this.line);
        Ticker.shared.add(this.update, this);
    }
    onPointerDown(e) {
        if (this.state !== BallState.Idle)
            return;
        if (this.hasLanched)
            return;
        this.SwipeData.isDown = true;
        this.SwipeData.startTime = Date.now();
        this.SwipeData.point = [];
        const p = this.toLocal(e.global.clone());
        this.SwipeData.point.push(p);
        this.line.clear();
        console.log('Pointer down');
    }
    onPointerMove(e) {
        if (this.hasLanched)
            return;
        if (!this.SwipeData.isDown)
            return;
        const CurrentTime = Date.now();
        const timeDiff = CurrentTime - this.SwipeData.startTime;
        if (timeDiff > 220) {
            this.onPointerUp();
            console.log('Pointer up due to timeout', this.SwipeData);
            return;
        }
        const p = this.toLocal(e.global.clone());
        this.SwipeData.point.push(p);
        this.drawline();
        // console.log('Pointer move', this.SwipeData);
    }
    drawline() {
        if (this.isFlying)
            return;
        const points = this.SwipeData.point;
        if (points.length < 2)
            return;
        this.line.clear();
        this.line.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            this.line.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        this.line.stroke({
            width: 140,
            color: 0x000000,
            alpha: 1,
            join: 'round',
        });
    }
    onPointerUp() {
        if (this.hasLanched)
            return;
        if (!this.SwipeData.isDown)
            return;
        this.SwipeData.isDown = false;
        this.line.clear();
        if (this.SwipeData.point.length < 3)
            return;
        this.LaunchBall();
    }
    LaunchBall() {
        this.hasLanched = true;
        this.isFlying = true;
        // caculate time
        let duration = Date.now() - this.SwipeData.startTime;
        if (duration < 1)
            duration = 1;
        // calculate distance
        const points = this.SwipeData.point;
        const start = points[0];
        const end = points[points.length - 1];
        const distX = end.x - start.x;
        const distY = start.y - end.y;
        const dist = Math.sqrt(distX * distX + distY * distY);
        if (dist < 5) {
            console.log('Swipe too short');
            return;
        }
        // curveforce
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const swipeAngle = Math.atan2(dy, dx);
        this.curveForce = Math.sin(swipeAngle) * Math.min(Math.abs(dx), 300) * 0.02;
        // speed
        let speed = 1.5 * dist / duration;
        if (speed > 90)
            speed = 90;
        if (speed < 1)
            speed = 1;
        // force
        const Power = 40;
        const totalForce = speed * Power;
        const ratioX = distX / dist;
        const ratioY = distY / dist;
        this.vz = 0.7 * totalForce * (0.96 - 0.1 * ratioY) + 10; // vertical force
        this.vy = 5 + totalForce * 0.1 + ratioY * 0.22; // horizontal force y
        if (this.vy < 25)
            this.vy = 1;
        this.vx = totalForce * ratioX * 0.65; // horizontal force x
        this.vx = Math.max(-500, Math.min(500, this.vx));
        console.log(`Speed: ${speed.toFixed(2)} px/ms`);
        console.log(`Power: ${totalForce.toFixed(2)}`);
        console.log(`Góc (RatioY): ${ratioY.toFixed(2)}`);
        console.log(`SÚT: vx=${this.vx.toFixed(1)}, vy=${this.vy.toFixed(1)}, vz=${this.vz.toFixed(1)}`);
        this.isFlying = true;
        // Rotation
        this.rotationSpeed = 0.1 * this.vx * 0.2;
        if (Math.abs(this.rotationSpeed) < 1) {
            this.rotationSpeed = (Math.random() > 0.2 ? 2 : -2) * 0.9;
        }
        console.log('Pointer up', this.SwipeData);
    }
    setGoal(goal) {
        this.goal = goal;
    }
    setNetLimit(minLocal, maxLocal) {
        this.netMinX = minLocal;
        this.netMaxX = maxLocal;
    }
    update(ticker) {
        // net animation
        if (this.isNetAnim == true) {
            if (this.netPhase === 'falling') {
                this.veTargetY += this.fg;
                this.ball.scale.x *= 0.998;
                this.ball.scale.y *= 0.998;
                this.ball.y += this.veTargetY;
                this.ball.x += this.veTargetX;
                const direction = this.netTargetX > this.ball.x ? 1 : -1;
                this.ball.rotation += direction * 0.1;
                if (this.ball.y >= this.netTargetY) {
                    this.ball.y = this.netTargetY;
                    if (this.veTargetY > 4) {
                        this.veTargetY = -this.veTargetY * 0.5;
                        this.veTargetX *= 0.6;
                    }
                    else {
                        this.netPhase = 'rolling';
                        const currentDirection = this.veTargetX > 0 ? 1 : -1;
                        const distanceToTarget = (this.netTargetX - this.ball.x) > 0 ? 1 : -1;
                        this.veTargetX = distanceToTarget * 0.1;
                        if (currentDirection !== distanceToTarget) {
                            this.netTargetX = this.ball.x + (this.veTargetX * 5);
                            if (this.netTargetX < this.netMinX)
                                this.netTargetX = this.netMinX;
                            if (this.netTargetX > this.netMaxX)
                                this.netTargetX = this.netMaxX;
                        }
                        this.veTargetX = (this.netTargetX - this.ball.x) * 0.01;
                    }
                }
            }
            if (this.netPhase === 'rolling') {
                this.ball.x += (this.netTargetX - this.ball.x) * 0.1;
                if (Math.abs(this.netTargetX - this.ball.x) < 1) {
                    this.ball.x = this.netTargetX;
                    this.netPhase = 'stopped';
                    this.isNetAnim = false;
                    this.ball.rotation *= 0.01;
                    if (this.ball.rotation < 0.0005)
                        this.ball.rotation = 0;
                }
            }
        }
        if (!this.isFlying)
            return;
        this.timescale += (0.7 - this.timescale) * 0.15;
        const dt = (ticker.deltaMS / 16.666) * this.timescale; // normalize to 60fps
        if (this.vy > 0) {
            this.vy -= this.fg * dt * 2.2;
        }
        else {
            this.vy -= this.fg * dt * 3;
        }
        this.vx += this.curveForce * dt;
        this.curveForce *= 0.94;
        // apply gravity
        this.x3d += this.vx * dt;
        const fallMul = this.vy < 0 ? 3.5 : 1.9;
        this.y3d += this.vy * dt * fallMul;
        this.z3d += this.vz * dt;
        const flightRatio = this.z3d / Math.max(this.z3d + 1, 3000);
        if (flightRatio > 0.55 && this.vy < 0) {
            this.vy -= this.fg * dt * 2.5;
        }
        //reach ground
        if (this.y3d <= 0) {
            this.y3d = 0;
            this.vy *= -0.4; // bounce
            this.vx *= 0.96;
            this.vz *= 0.8;
            if ((Math.abs(this.vx) < 0.5 && Math.abs(this.vy) < 1 && this.vz < 0.5) || this.ball.scale.x <= 0.1 || this.ball.rotation <= 0.1 && this.state === BallState.Flying) {
                this.reset();
            }
        }
        this.renderBall(dt);
        if (this.ball.x < -100 || this.ball.x > BASE_WIDTH + 75) {
            console.log('out screen');
            this.reset();
            return;
        }
    }
    // render ball & shadow
    renderBall(dt) {
        // Render
        const focalLength = 800;
        const scale = focalLength / (focalLength + this.z3d);
        const CENTERX = BASE_WIDTH / 2;
        const START_Y = BASE_HEIGHT * 0.79;
        this.ball.x = CENTERX + this.x3d * scale;
        this.ball.y = START_Y - this.y3d * scale - this.z3d * scale * 1.2;
        if (this.isFlying) {
            if (this.vz >= 10 || this.vy > 0.1) {
                this.visualScale += 0.01 + (scale - this.visualScale) * 0.045;
                this.ball.scale.set(this.visualScale);
            }
            else {
                this.ball.scale.set(this.visualScale);
            }
            // Rotation update
            this.ball.rotation += this.rotationSpeed * dt * 0.18;
            this.rotationSpeed *= 0.98;
            if (this.rotationSpeed > 2.5)
                this.rotationSpeed = 2.5;
            if (this.rotationSpeed < -2.5)
                this.rotationSpeed = -2.5;
            // console.log(`scale :${scale.toFixed(2)} , visualScale: ${this.visualScale.toFixed(2)}`);
            // render shadow
            this.shadow.x = this.ball.x;
            this.shadow.y = START_Y - (this.z3d * scale * 1.2) + (CONFIG.ballradius * scale);
            this.shadow.scale.set(scale);
            this.shadow.alpha = Math.max(0.1, 0.5 - this.y3d / 800);
        }
        else {
            return;
        }
        //anim fadoff
        const fade_start = 80000;
        const fade_end = 90000;
        if (this.z3d >= fade_start) {
            console.log('fly to the sky');
            const faderatio = (this.z3d - fade_start) / (fade_end - fade_start);
            const newalpha = 1.0 - faderatio;
            this.ball.alpha = Math.max(0, newalpha);
            this.shadow.alpha = 0;
            if (this.ball.alpha <= 0.1 || this.z3d >= fade_end) {
                this.reset();
                return;
            }
        }
        else {
            if (this.z3d < fade_start) {
                this.ball.alpha = 1;
            }
        }
    }
    // net catch
    onNetCatch(targetGlobalX, targetGlobalY, impactForce = 0) {
        this.isFlying = false;
        const globalPos = new Point(targetGlobalX, targetGlobalY);
        const localPos = this.toLocal(globalPos);
        this.netTargetX = localPos.x;
        this.netTargetY = localPos.y;
        this.isNetAnim = true;
        this.netPhase = 'falling';
        this.veTargetY = Math.min(impactForce * 0.05, 8);
        const deltaX = (this.netTargetX - this.ball.x) * 0.05;
        this.veTargetX = Math.max(-15, Math.min(15, deltaX));
        console.log('veTargetX:', this.veTargetX, this.veTargetY);
    }
    //reset
    reset(reason = "unknown") {
        this.state = BallState.Idle;
        this.isFlying = false;
        const CENTERX = BASE_WIDTH / 2;
        const CENTERY = BASE_HEIGHT * 0.79;
        this.x3d = 0;
        this.y3d = 0;
        this.z3d = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.initball();
        this.ball.position.set(CENTERX, CENTERY);
        this.visualScale = 1;
        this.ball.scale.set(this.visualScale);
        this.ball.alpha = 1;
        this.shadow.position.set(CENTERX, CONFIG.ballradius + CENTERY);
        this.shadow.scale.set(1);
        this.shadow.alpha = 0.5;
        this.rotationSpeed = 0;
        this.ball.rotation = 0;
        this.line.clear();
        this.hasLanched = false;
    }
    destroy() {
        Ticker.shared.remove(this.update, this);
        super.destroy();
    }
}
