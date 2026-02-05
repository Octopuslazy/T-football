import {Container, Graphics, Point, FederatedPointerEvent, Ticker, Sprite } from "pixi.js";
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BASE_WIDTH, BASE_HEIGHT } from "../constant/global";  
import { BallCollision } from "./ballCollision";
import Goal from "./goal";
import Goalkeeper, { GoalkeeperAction } from "./goalkeeper";
const CONFIG = {
    ballradius: 145,    

};
enum BallState {
    Idle,
    Flying,
    Landing,
}
interface SwipeData {
    point: Point[];
    startTime: number;
    isDown: boolean;
}

export class BallGame extends Container {
    public ball!: Container;
    public shadow!: Graphics;
    public SwipeData: SwipeData;
    private line!: Graphics;
    public visualScale: number = 1;
    public timescale: number = 1;
    private state: BallState = BallState.Idle;
    public hasLanched: boolean = false;
    private curveForce: number = 0;
    private goal!: Goal;
    private playerSpine: Spine | null = null;
    private isWaitingForAnimation: boolean = false;
    private goalkeeper: Goalkeeper | null = null;
    public isKeeperSaved: boolean = false;
    private isfadoff: boolean = false;
    // 3d 
    public x3d: number = 0;
    public y3d: number = 0 ;
    public z3d: number = 0;

    // verlocity
    public vx: number =0;
    public vy: number =0;
    public vz: number =0;

    //force
    private fg: number =0.98; // gravity
    private fr: number =0.96; // resistance

    //Rotation
    private rotationSpeed: number =0;

    //Net phase
    public isNetAnim: boolean = false;
    public netPhase: 'falling' | 'rolling' | 'stopped' = 'stopped';

    private netTargetX: number = 0;
    private netTargetY: number = 0;
    private veTargetX: number = 0;
    private veTargetY: number = 0;

    public netMinX: number = -Infinity;
    public netMaxX: number = Infinity;

    // state
    public isFlying: boolean = false;
    constructor() {
        super();
        
        this.initshadow();
        this.initball();
        this.initline();
       
        

        // Input swipe
        this.SwipeData = { point: [], startTime: 0, isDown: false };
        this.eventMode = 'static';
        this.hitArea = { contains: () => true } as any;
        // event
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointermove', this.onPointerMove.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerUp.bind(this));
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space'){
                this.reset();
            }
        });
        this.reset();
    }
    initball() {
        //ball handle
        if (this.ball){
            this.ball.destroy({ children: true });  
        }
        this.ball = new Container();
        const ballSprite = Sprite.from('/Assets/arts/ball.png');
        ballSprite.anchor.set(0.5,0.5);
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

    //#region swipe input
    onPointerDown(e: FederatedPointerEvent) {
        if (this.state !== BallState.Idle) return;
        if (this.hasLanched) return;
        this.SwipeData.isDown = true;
        this.SwipeData.startTime = Date.now();
        this.SwipeData.point = [];
        const p = this.toLocal(e.global.clone());
        this.SwipeData.point.push(p);
        this.line.clear();
        console.log('Pointer down'  );
        
    }
    onPointerMove(e: FederatedPointerEvent) {
        if (this.hasLanched) return;
        if (!this.SwipeData.isDown) return;
        
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
        if (this.isFlying) return;
        const points = this.SwipeData.point;
        if (points.length < 2) return;
        this.line.clear();
        this.line.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length-2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            this.line.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
         
        this.line.stroke({
            width: 140,
            color: 0x000000,
            alpha: 1,
            join: 'round',
        })}

    onPointerUp() {
        if (this.hasLanched) return;
        if (!this.SwipeData.isDown) return;
        this.SwipeData.isDown = false;
        this.line.clear();
        if (this.SwipeData.point.length < 3) return;
        const snapResult = this.getSnap(0.5);
        if (snapResult) {
            console.log('✅ Predicted trajectory:', snapResult);
        } else {
            console.log('❌ Cannot predict trajectory');
        }

        // Start player animation first
        this.initShooter();
        
    }
    //#region Shoot the ball
    LaunchBall() {
        this.hasLanched = true;
        this.isFlying = true;
        // caculate time
        let duration = Date.now() - this.SwipeData.startTime - 650;
        if (duration < 150) duration = 150;

        // calculate distance
        const points = this.SwipeData.point;
        const start = points[0];
        const end = points[points.length - 1];

        const distX = (end.x - start.x)/1.1;
        const distY = (start.y - end.y)/2; 
        const dist = Math.sqrt(distX * distX + distY * distY);
        console.log(`Distance: ${dist.toFixed(2)} px, Duration: ${duration} ms`);
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
        let speed = 3*dist/duration;
        if (speed > 75) speed = 75;
        if (speed < 5) speed = 5;

        // force
        const Power = 60;
        const totalForce = speed * Power;
        const ratioX = distX / dist;
        const ratioY = distY / dist;

        this.vz = 0.9*totalForce * (0.96 - 0.1*ratioY) + 10; // vertical force
        this.vy = 4 + totalForce *0.17 + ratioY * 0.22; // horizontal force y
        if (this.vy < 55.5) {
            this.vy = 5;
            this.vz += 90;
            this.scale.y *= 0.98;
            this.scale.x *= 0.98;
        }
        this.vx = totalForce * ratioX * 0.65; // horizontal force x
        this.vx = Math.max(-500, Math.min(500, this.vx));

        console.log(`Speed: ${speed.toFixed(2)} px/ms`);
        console.log(`Power: ${totalForce.toFixed(2)}`);
        console.log(`Góc (RatioY): ${ratioY.toFixed(2)}`);
        console.log(`SÚT: vx=${this.vx.toFixed(1)}, vy=${this.vy.toFixed(1)}, vz=${this.vz.toFixed(1)}`);

        this.isFlying = true;

        // Rotation
        this.rotationSpeed = 0.2 * this.vx * 0.2;
        if (Math.abs(this.rotationSpeed) < 1) {
            this.rotationSpeed = (Math.random()>0.2?2:-2)*0.9;
        }

        console.log('Pointer up', this.SwipeData);
    }
    public setGoal(goal: Goal) {
    this.goal = goal;
    }

    public setPlayerSpine(playerSpine: Spine | null) {
        this.playerSpine = playerSpine;
        console.log('🎯 Player spine set in ball:', !!this.playerSpine);
        if (this.playerSpine) {
            console.log('🎯 Player spine details:', {
                x: this.playerSpine.x,
                y: this.playerSpine.y,
                visible: this.playerSpine.visible,
                scale: this.playerSpine.scale.x
            });
        }
    }

    public setNetLimit(minLocal: number, maxLocal: number) {
        this.netMinX = minLocal;
        this.netMaxX = maxLocal;
    }
    //#region Update
    update(ticker: Ticker) {

        // net animation
        if (this.isNetAnim == true) {
            if (this.netPhase === 'falling') {
                this.veTargetY += this.fg;
                this.ball.scale.x *=0.998;
                this.ball.scale.y *=0.998;
                this.ball.y += this.veTargetY;
                this.ball.x += this.veTargetX;

                if (this.ball.x < this.netMinX) {
                    this.ball.x = this.netMinX; 
                    this.veTargetX *= -0.6; 
                } 
             
                else if (this.ball.x > this.netMaxX) {
                    this.ball.x = this.netMaxX;
                    this.veTargetX *= -0.6; 
                }

                const direction = this.netTargetX > this.ball.x ? 1 : -1;
                this.ball.rotation += direction * 0.2;

                if (this.ball.y >= this.netTargetY ) {
                    this.ball.y = this.netTargetY;

                    if (this.veTargetY > 3) {
                        this.veTargetY = -this.veTargetY*0.6;
                        this.veTargetX *= 0.6;
                    } else {
                        this.netPhase = 'rolling';

                        let rollDistance = this.veTargetX * 4; 
                        this.netTargetX = this.ball.x + rollDistance;
                        if (this.netTargetX < this.netMinX) {
                            this.netTargetX = this.netMinX;
                        } 
                        else if (this.netTargetX > this.netMaxX) {
                            this.netTargetX = this.netMaxX;
                        }
                }}
            }
            if (this.netPhase === 'rolling') {
                this.ball.x += (this.netTargetX-this.ball.x)*0.1;
                if (Math.abs(this.netTargetX - this.ball.x) < 1) {
                    this.ball.x = this.netTargetX;
                    this.netPhase = 'stopped';
                    this.isNetAnim = false;
                    this.ball.rotation *= 0.01;
                    if (this.ball.rotation < 0.0005) this.ball.rotation = 0;
                }
            }
        }

        
        if (!this.isFlying) return;
        this.timescale += (0.85 - this.timescale) * 0.15;
        
        const frameMultiplier = 1.7;
        const dt = (ticker.deltaMS / 16)*this.timescale; // normalize to 60fps

        if (this.isKeeperSaved && this.visualScale < 1.0) {
            this.visualScale += 0.02 * dt; // Tốc độ scale up
            if (this.visualScale > 1.0) {
                this.visualScale = 1.0;
            }
        }

        for (let i =0 ; i< frameMultiplier; i++) {
            this.renderBall(dt/frameMultiplier);
        }
        if (this.vy > 0) {
            
            this.vy -= this.fg * dt * 2.2;
        } else {
            
            this.vy -= this.fg * dt * 3;
        }
        this.vx += this.curveForce * dt;
        this.curveForce *= 0.94;
        // apply gravity
        this.x3d += this.vx*dt;
        const fallMul = this.vy < 0 ? 1.5 : 1.5;
        this.y3d += this.vy * dt * fallMul;
        this.z3d += this.vz*dt;

        const flightRatio = this.z3d / Math.max(this.z3d + 1, 3000);
        if (flightRatio > 0.55 && this.vy < 0) {
            this.vy -= this.fg * dt * 2.5;
        }    

        //Baymutchi
        if (!this.isKeeperSaved && this.isfadoff) {
            this.vz  *=2;
            this.vy *=1.2;
            this.rotationSpeed *=1.2;
            this.visualScale *=0.98;
            console.log('bay mutchi');
            console.log(`vz: ${this.vz.toFixed(2)}, vy: ${this.vy.toFixed(2)}`);

        }


        //reach ground
        if (this.y3d <= 0) {
            this.y3d = 0;
            this.vy *= -0.4; // bounce
            this.vx *= 0.96;
            this.vz *= 0.9;
            if ((Math.abs(this.vx) < 0.5 && Math.abs(this.vy) < 1 && this.vz < 0.5) || this.ball.scale.x <= 0.1|| this.ball.rotation <= 0.1 && this.state === BallState.Flying) {
                this.reset();
            }
        }

        this.renderBall(dt);
        if (this.ball.x < -5000 || this.ball.x > BASE_WIDTH + 5000) {
            console.log('out screen');
            this.reset();
            return;
        }
    }
    
    //#region RenderBall
    // render ball & shadow
    renderBall(dt: number) {
        // Render
        const focalLength = 900;
        
        const scale = focalLength / (focalLength + this.z3d);
        const CENTERX = BASE_WIDTH / 2;
        const START_Y = BASE_HEIGHT * 0.79;

        this.ball.x = CENTERX + this.x3d * scale;
        this.ball.y = START_Y - this.y3d * scale - this.z3d*scale*1.2;
        

        if (this.isFlying) {
            if (this.vz >= 10 || this.vy > 0.1){
                this.visualScale += 0.01+(scale - this.visualScale) * 0.051;
                this.ball.scale.set(this.visualScale);
            } else {
                this.ball.scale.set(this.visualScale);
            }
        // Rotation update
        this.ball.rotation += this.rotationSpeed * dt*0.18;
        this.rotationSpeed *= 0.98;
        if (this.rotationSpeed > 2.5) this.rotationSpeed = 2.5;
        if (this.rotationSpeed < -2.5) this.rotationSpeed = -2.5;
       
        // console.log(`scale :${scale.toFixed(2)} , visualScale: ${this.visualScale.toFixed(2)}`);

        // render shadow
        this.shadow.x = this.ball.x;
        this.shadow.y = START_Y - (this.z3d * scale * 1.2) + (CONFIG.ballradius * scale);
        this.shadow.scale.set(scale);
        this.shadow.alpha = Math.max(0.1, 0.5 - this.y3d / 800);  
        } else {
            return;
        }
        //anim fadoff
        const fade_start = 65000;
        const fade_end = 70000;
       
        if (this.z3d >= fade_start) {
            this.isfadoff = true;
            console.log('fly to the sky');
            const faderatio = (this.z3d - fade_start) / (fade_end - fade_start);
            const newalpha = 1.0 - faderatio*0.7;
            this.ball.alpha = Math.max(0, newalpha);
            this.shadow.alpha = Math.max(0, 0.5 - faderatio);
            if (this.ball.alpha <= 0.1 || this.z3d >= fade_end) {
                this.reset();
                return;
            }

        } else {
            if (this.z3d < fade_start) {
                this.ball.alpha = 1;
            }}
    }

    //#region Net catch
    public onNetCatch(targetGlobalX: number, targetGlobalY: number, impactForce: number = 0) {
        this.isFlying = false;

        const globalPos = new Point(targetGlobalX, targetGlobalY);
        const localPos = this.toLocal(globalPos);
        this.netTargetX = localPos.x;
        this.netTargetY = localPos.y;

        this.isNetAnim = true;
        this.netPhase = 'falling';
        this.veTargetY = Math.min( impactForce * 0.05, 8);
        const deltaX = (this.netTargetX - this.ball.x) * 0.05;
        this.veTargetX = Math.max(-10, Math.min(10, deltaX));
        console.log('veTargetX:', this.veTargetX, this.veTargetY);
    }

    // post collision out
    public reboundBall(Vx: number, Vy: number, Vz: number) {
        this.vx = Vx;
        this.vy = Vy;
        this.vz = Vz;
        this.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * Math.random() * 2;
        this.isFlying = true;
        this.isNetAnim = false;
        if (this.state !== undefined) {
        this.state = BallState.Flying; 
        }
    }
    //#region TakeSnap on Net
    public getSnap(targetScale: number): { x: number, y: number, timeFrames: number } | null{
        const focalLength = 900;
        const targetZ = (focalLength *(1-targetScale))/ targetScale;
        const pred = this.predictTrajectoryBeforeLaunch(targetZ);

        if (!pred) {return null;}
        const CenX = BASE_WIDTH / 2;
        const CenY = BASE_HEIGHT * 0.79;

        const ScreenX = CenX + pred.x* targetScale;
        const ScreenY = CenY - pred.y* targetScale - targetZ* targetScale*1.2;
        console.log(`Snap at scale ${targetScale.toFixed(2)} : x=${ScreenX.toFixed(1)}, y=${ScreenY.toFixed(1)}, frames=${pred.timeFrames}`);
        return {
            x: ScreenX,
            y: ScreenY,
            timeFrames: pred.timeFrames
        };

    }

    
    public predictTrajectoryBeforeLaunch(targetZ: number): { x: number, y: number, timeFrames: number } | null {
        // Calculate velocity from current swipe data
        const points = this.SwipeData.point;
        if (points.length < 2) return null;
    
        const start = points[0];
        const end = points[points.length - 1];
    
        const distX = (end.x - start.x)/1.1;
        const distY = (start.y - end.y)/2; 
        const dist = Math.sqrt(distX * distX + distY * distY);
    
        if (dist < 5) return null;
    
        let duration = Date.now() - this.SwipeData.startTime - 650;
        if (duration < 150) duration = 150;
    
        let speed = 2*dist/duration;
        if (speed > 62) speed = 62;
        if (speed < 5) speed = 5;
    
        const Power = 60;
        const totalForce = speed * Power;
        const ratioX = distX / dist;
        const ratioY = distY / dist;
    
        // Calculate predicted velocities (same as LaunchBall)
        const predictVx = totalForce * ratioX * 0.65;
        const predictVy = 4 + totalForce * 0.18 + ratioY * 0.22;
        const predictVz = 0.9*totalForce * (0.96 - 0.1*ratioY) + 10;
    
        if (predictVz <= 0) return null;
    
        // Simulate trajectory with predicted velocities
        return this.simulateTrajectory(targetZ, predictVx, predictVy, predictVz);
    }

    private simulateTrajectory(targetZ: number, startVx: number, startVy: number, startVz: number): { x: number, y: number, timeFrames: number } | null {
        let simX = 0; // Start from origin
        let simY = 0;
        let simZ = 0;
        let simVx = startVx;
        let simVy = startVy;
        let simVz = startVz;
        let simCurve = this.curveForce;
        
        const dt = 1.0;
        let frames = 0;
        const maxFrames = 300;
        
        while (simZ < targetZ && frames < maxFrames) {
            frames++;
            
            // Apply same physics as update()
            if (simVy > 0) {
                simVy -= this.fg * dt * 2.2;
            } else {
                simVy -= this.fg * dt * 3;
            }
            
            simVx += simCurve * dt;
            simCurve *= 0.94;
            
            simX += simVx * dt;
            const fallMul = simVy < 0 ? 1.5 : 1.5;
            simY += simVy * dt * fallMul;
            simZ += simVz * dt;
            
            const flightRatio = simZ / Math.max(simZ + 1, 3000);
            if (flightRatio > 0.55 && simVy < 0) {
                simVy -= this.fg * dt * 2.5;
            }
            
            if (simY <= 0) {
                simY = 0;
                simVy *= -0.4;
                simVx *= 0.96;
                simVz *= 0.8;
                if (simVz < 0.1) return null;
            }
        }
        
        if (frames >= maxFrames) return null;
        
        return { x: simX, y: simY, timeFrames: frames };
    }
    //#region Calltheshooter
    public initShooter(){
        if (this.isWaitingForAnimation) return;
        
        console.log('🏃 InitShooter called');
        console.log('🏃 Player spine exists:', !!this.playerSpine);
        
        this.isWaitingForAnimation = true;
        
        // Show player and play animations: Run -> Kick -> Launch ball
        if (this.playerSpine && this.playerSpine.state) {
            try {
                console.log('🏃 Ball position:', this.ball.x, this.ball.y);
                
                // Set player starting position (40% of ball X position)
                const startX = this.ball.x * 0.65;
                const endX = this.ball.x * 0.65;
                const playerY = this.ball.y*1.05;
                
                this.playerSpine.x = startX;
                this.playerSpine.y = playerY;
                this.playerSpine.scale.set(1.0);
                this.playerSpine.alpha = 1.0;
                
                // Show player spine
                this.playerSpine.visible = true;
                
                // Ensure player is on top layer (above ball)
                if (this.playerSpine.parent) {
                    this.playerSpine.parent.setChildIndex(this.playerSpine, this.playerSpine.parent.children.length - 1);
                }
                
                console.log('🏃 Player starting position:', startX, 'target:', endX);
                
                // Skip Run animation, go directly to Kick
                this.playerSpine.state.setAnimation(0, 'Kick', false);
                console.log('🦵 Kick animation started immediately at position:', this.playerSpine.x);
                
                // Launch ball after 0.1s (100ms) kick animation
                setTimeout(() => {
                    this.LaunchBall();
                    this.isWaitingForAnimation = false;
                    
                    // Fade out player alpha from 1 to 0 in 0.3s
                    if (this.playerSpine) {
                        const fadeStartTime = Date.now();
                        const fadeDuration = 300; // 0.3s
                        
                        const fadeOut = () => {
                            const elapsed = Date.now() - fadeStartTime;
                            const progress = Math.min(elapsed / fadeDuration, 1);
                            
                            // Interpolate alpha from 1 to 0
                            const alpha = 1 - progress;
                            if (this.playerSpine) {
                                this.playerSpine.alpha = alpha;
                            }
                            
                            // Continue fade until complete
                            if (progress < 1) {
                                requestAnimationFrame(fadeOut);
                            } else {
                                // Fade complete, hide player
                                if (this.playerSpine) {
                                    this.playerSpine.visible = false;
                                    this.playerSpine.alpha = 1; // Reset alpha for next time
                                }
                            }
                        };
                        
                        // Start fade animation
                        fadeOut();
                    }
                }, 100); // 0.1s kick animation duration
                
            } catch (e) {
                // Fallback if animation fails
                setTimeout(() => {
                    this.LaunchBall();
                    this.isWaitingForAnimation = false;
                    if (this.playerSpine) {
                        this.playerSpine.visible = false;
                    }
                }, 400);
            }
        } else {
            // No player spine, launch immediately
            this.LaunchBall();
            this.isWaitingForAnimation = false;
        }
    }

    //#region Reset


    public setGoalkeeper(goalkeeper: Goalkeeper) {
    this.goalkeeper = goalkeeper;
    }
    public reset(reason:string = "unknown"){
        this.state = BallState.Idle;
        this.isWaitingForAnimation = false;
        const CENTERX = BASE_WIDTH / 2;
        const CENTERY = BASE_HEIGHT * 0.79;


        this.x3d = 0; this.y3d = 0; this.z3d = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;

        if (this.parent && this.goalkeeper) {
            const parent = this.parent;
            const keeperIndex = parent.getChildIndex(this.goalkeeper);
            const ballIndex = parent.getChildIndex(this);
            if (ballIndex < keeperIndex) {
                parent.setChildIndex(this, keeperIndex -1);
            }
        }
        
        
        this.visualScale = 1;
        this.ball.scale.set(this.visualScale);
        this.ball.alpha = 1;
        
        this.shadow.scale.set(1);
        this.shadow.alpha = 0.5;
        this.rotationSpeed = 0;
        this.ball.rotation = 0;
        this.line.clear();
        this.hasLanched = false; 
        this.goalkeeper?.reset();
        this.isKeeperSaved = false;
        this.isfadoff = false;

        this.position.set(0, 0);
        this.scale.set(1, 1);
        this.pivot.set(0, 0);

        this.isFlying = true;
        this.renderBall(0);
        this.isFlying = false;
        console.log('RESET ball pos:', this.ball.x, this.ball.y);

        
    }
    
    override destroy() {
    Ticker.shared.remove(this.update, this);
    super.destroy();
  }

}


