import {Container, Graphics, Point, FederatedPointerEvent, Ticker } from "pixi.js";
import { BASE_WIDTH, BASE_HEIGHT } from "../constant/global";
const CONFIG = {
    ballradius: 60,    

};
interface SwipeData {
    point: Point[];
    startTime: number;
    isDown: boolean;
}

export class BallGame extends Container {
    public ball!: Container;
    public shadow!: Graphics;
    private SwipeData: SwipeData;
    private line!: Graphics;
    private visualScale: number = 1;
    private timescale: number = 1;

    // 3d 
    private x3d: number = 0;
    private y3d: number = 0 ;
    private z3d: number = 0;

    // verlocity
    private vx: number =0;
    private vy: number =0;
    private vz: number =0;

    //force
    private fg: number =0.98; // gravity
    private fr: number =0.96; // resistance

    //Rotation
    private rotationSpeed: number =0;

    // state
    public isFlying: boolean = false;
    constructor() {
        super();
        this.shadow = new Graphics();
        this.shadow
            .ellipse(0, 0, CONFIG.ballradius * 0.8, CONFIG.ballradius * 0.7)
            .fill(0xffffff)
            .stroke({ width: 2, color: 0x000000, alpha: 0.3 });

        this.addChild(this.shadow)
        this.initball();
        

        // Input swipe
        this.SwipeData = { point: [], startTime: 0, isDown: false };
        this.eventMode = 'static';
        this.hitArea = { contains: () => true } as any;
        // event
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointermove', this.onPointerMove.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerUp.bind(this));

        // line handle
        this.line = new Graphics();
        this.line.alpha = 0.4;
        this.addChild(this.line);
        Ticker.shared.add(this.update, this);
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space'){
                this.resetpossition();
            }
        });
        this.resetpossition();
    }
    initball() {
        if (this.ball){
            this.ball.destroy({ children: true });  
        }
        this.ball = new Container();
        const circle = new Graphics();
        circle.circle(0, 0, CONFIG.ballradius).fill(0xffffff).stroke({ width: 2, color: 0x000000  });
        const pattern = new Graphics();
        pattern.circle(0,0,CONFIG.ballradius*0.5);
        pattern.moveTo(0, CONFIG.ballradius).lineTo(0.5, 0.5*CONFIG.ballradius).fill(0xffffff).stroke({ width: 2, color: 0x000000 });
        this.ball.addChild(circle, pattern);
        this.addChild(this.ball);
    }
    resetpossition() {
        const CENTERX = BASE_WIDTH / 2;
        const CENTERY = BASE_HEIGHT * 0.75;

        this.x3d = 0; this.y3d = 0; this.z3d = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.isFlying = false;
        this.initball();
        this.ball.position.set(CENTERX, CENTERY);
        this.visualScale = 1;
        this.ball.scale.set(this.visualScale);
        this.shadow.position.set(CENTERX, CONFIG.ballradius+ CENTERY);
        this.shadow.scale.set(1);
        this.shadow.alpha = 0.5;
        this.rotationSpeed = 0;
        this.ball.rotation = 0;
        this.line.clear();
    }
    onPointerDown(e: FederatedPointerEvent) {
        if (this.isFlying) return;
        this.SwipeData.isDown = true;
        this.SwipeData.startTime = Date.now();
        this.SwipeData.point = [];
        const p = this.toLocal(e.global.clone());
        this.SwipeData.point.push(p);
        this.line.clear();
        console.log('Pointer down'  );
        
    }
    onPointerMove(e: FederatedPointerEvent) {
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
        if (!this.SwipeData.isDown) return;
        this.SwipeData.isDown = false;
        this.line.clear();

        // caculate time
        let duration = Date.now() - this.SwipeData.startTime;
        if (duration < 1) duration = 1;

        // calculate distance
        const points = this.SwipeData.point;
        const start = points[0];
        const end = points[points.length - 1];

        const distX = end.x - start.x;
        const distY = start.y - end.y; 
        const dist = Math.sqrt(distX * distX + distY * distY);

        // speed
        let speed = 1.2*dist/duration;
        if (speed > 30) speed = 30;
        if (speed < 1) speed = 1;

        // force
        const Power = 45;
        const totalForce = speed * Power;
        const ratioX = distX / dist;
        const ratioY = distY / dist;

        this.vz = 1.6*totalForce * (0.96 - 0.1*ratioY)+5; // vertical force
        this.vy = totalForce *0.09 + ratioY * 0.22; // horizontal force y
        if (this.vy < 25) this.vy = 1;
        this.vx = totalForce * ratioX * 0.65; // horizontal force x
        this.vx = Math.max(-60, Math.min(40, this.vx));

        console.log(`Speed: ${speed.toFixed(2)} px/ms`);
        console.log(`Power: ${totalForce.toFixed(2)}`);
        console.log(`Góc (RatioY): ${ratioY.toFixed(2)}`);
        console.log(`SÚT: vx=${this.vx.toFixed(1)}, vy=${this.vy.toFixed(1)}, vz=${this.vz.toFixed(1)}`);

        this.isFlying = true;

        // Rotation
        this.rotationSpeed = 0.1 * this.vx * 0.1;
        if (Math.abs(this.rotationSpeed) < 1) {
            this.rotationSpeed = (Math.random()>0.2?1:-1)*0.4;
        }

        console.log('Pointer up', this.SwipeData);
    }

    update(ticker: Ticker) {
        this.timescale += (1 - this.timescale) * 0.15;
        const dt = (ticker.deltaMS / 16.666)*this.timescale; // normalize to 60fps
        if (this.vy > 0) {
            // đang bay lên → gravity nhẹ
            this.vy -= this.fg * dt * 2.2;
        } else {
            // đang rơi → ép rơi nhanh
            this.vy -= this.fg * dt * 2.2;
        }// apply gravity
        this.x3d += this.vx*dt;
        const fallMul = this.vy < 0 ? 2.5 : 1.9;
        this.y3d += this.vy * dt * fallMul;
        this.z3d += this.vz*dt;

        const flightRatio = this.z3d / Math.max(this.z3d + 1, 3000);
        if (flightRatio > 0.55 && this.vy < 0) {
            this.vy -= this.fg * dt * 2.5;
        }
        // Rotation update
        if (this.isFlying) {
            this.ball.rotation += this.rotationSpeed * dt;
            this.rotationSpeed *= 0.98;
        } else {
            this.ball.rotation = 0;
        }
            


        //reach ground
        if (this.y3d <= 0) {
            this.y3d = 0;
            this.vy *= -0.5; // bounce
            this.vx *= 0.985;
            this.vz *= 0.885;
            if (Math.abs(this.vy)<1 && this.vz < 1) {
                this.resetpossition();
            }
        }
        // Render
        const focalLength = 8000;
        const scale = focalLength / (focalLength + this.z3d);
        const CENTERX = BASE_WIDTH / 2;
        const START_Y = BASE_HEIGHT * 0.75;

        this.ball.x = CENTERX + this.x3d * scale;
        this.ball.y = START_Y - this.y3d * scale - this.z3d*scale*0.1;
        this.visualScale += (scale - this.visualScale) * 0.01;
        this.ball.scale.set(this.visualScale);

        this.shadow.x = this.ball.x;
        this.shadow.y = START_Y - (this.z3d * scale * 0.1) + (CONFIG.ballradius * scale);
        this.shadow.scale.set(scale);
        this.shadow.alpha = Math.max(0.1, 0.5 - this.y3d / 800);
    }

}
        

