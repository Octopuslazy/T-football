import * as PIXI from 'pixi.js';
import { spawnImpactEffect } from './impact.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Ball extends PIXI.Container {
  // --- Visuals ---
  private ballSprite!: PIXI.Sprite;
  private shadowSprite!: PIXI.Graphics;
  private _previewGraphics: PIXI.Graphics | null = null;

  // --- Physics & State ---
  private _velocity = { x: 0, y: 0 }; // 2D placeholder (cho tương thích cũ)
  
  // 3D Physics Properties
  private _z: number = 0;           // Độ sâu (0 = điểm đặt bóng)
  private _altitude: number = 0;    // Độ cao so với mặt đất (Y ngược)
  private _vx: number = 0;          // Vận tốc ngang
  private _vy: number = 0;          // Vận tốc dọc (Altitude velocity)
  private _vz: number = 0;          // Vận tốc chiều sâu (Depth velocity)
  private _curveFactor: number = 0; // Lực xoáy (Magnus effect)
  
  // Constants
  private readonly GOAL_DISTANCE = 600; // Khoảng cách từ điểm sút đến khung thành
  private readonly GRAVITY = 1.1;
  private readonly FRICTION = 0.99;
  private readonly GROUND_Y_OFFSET = 100; // Điều chỉnh mặt đất

  // Flags
  private _isMoving = false;
  private _isDragging = false;
  private _dragPath: Array<{ x: number; y: number }> = [];
  private _dragTime = 0;
  private _goalScored = false;      // Đã xác nhận bàn thắng chưa
  private _ballUsed = false;        // Bóng đã vào lưới hoặc ra ngoài chưa
  private _keeperCooldown = false;  // Cooldown sau khi thủ môn chạm bóng

  // External Refs
  public goal: any;
  public goalkeeper: any;
  public gameState: any;
  
  // Callbacks
  public onBallDestroyed?: () => void;
  public goalScoredCallback?: (zone: any) => void;
  public saveCallback?: () => void;
  public outCallback?: () => void;

  private onEnterFrame!: () => void;
  private _baseScale = 0.6;
  private _groundLevelY = 0;
    private _powerMultiplier = 5.2; // reduced shot power

  constructor(gameState?: { ballsRemaining: number; gameOver: boolean }, goal?: any, goalkeeper?: any) {
    super();
    if (gameState) this.gameState = gameState;
    this.goal = goal;
    this.goalkeeper = goalkeeper;

    this.createVisuals();

    this.interactive = true;
    this.cursor = 'pointer';

    this.on('pointerdown', this._onPointerDown);
    this.on('pointermove', this._onPointerMove);
    this.on('pointerup', this._onPointerUp);
    this.on('pointerupoutside', this._onPointerUp);

    this.onEnterFrame = this.update.bind(this);
    PIXI.Ticker.shared.add(this.onEnterFrame);
    
    // Initial sizing
    this.updateScale();
    window.addEventListener('resize', () => this.updateScale());
  }

  private createVisuals() {
    const baseRadius = 38;
    const canvas = document.createElement('canvas');
    canvas.width = baseRadius * 2;
    canvas.height = baseRadius * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(baseRadius, baseRadius, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      // Simple texture pattern
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(baseRadius + 15, baseRadius - 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(baseRadius - 15, baseRadius + 15, 6, 0, Math.PI * 2); ctx.fill();
    }
    const tex = PIXI.Texture.from(canvas as any);
    
    this.shadowSprite = new PIXI.Graphics();
    this.addChild(this.shadowSprite);

    this.ballSprite = new PIXI.Sprite(tex);
    this.ballSprite.anchor.set(0.5);
    this.addChild(this.ballSprite);

    this._previewGraphics = new PIXI.Graphics();
    this.addChild(this._previewGraphics);
  }

  private updateScale() {
    if (!this.ballSprite || !this.ballSprite.texture) return;
    const targetWidth = BASE_WIDTH / 6;
    const s = targetWidth / this.ballSprite.texture.width;
    this._baseScale = s;
    this.ballSprite.scale.set(s, s);
    
    const groundLevel = (BASE_HEIGHT * 3) / 4;
    this.x = Math.round(BASE_WIDTH / 2);
    this.y = groundLevel;
    this._groundLevelY = this.y;
    
    this.updateShadow(this._groundLevelY, this._baseScale);
  }

    // Public helper: set the ball's base scale (affects final scale and shadow)
    public setScale(factor: number) {
        if (!factor || factor <= 0) return;
        this._baseScale = factor;
        if (this.ballSprite && this.ballSprite.texture) {
            this.ballSprite.scale.set(this._baseScale, this._baseScale);
        }
        // Update shadow with current ground level
        this.updateShadow(this._groundLevelY || (BASE_HEIGHT * 3) / 4, this._baseScale);
    }

  // --- INPUT HANDLING ---

  private _onPointerDown = (e: any) => {
    if (this._isMoving || this._ballUsed) return;
    this._isDragging = true;
    this._dragPath = [];
    this._dragTime = performance.now();
    const p = e.data.global;
    this._dragPath.push({ x: p.x, y: p.y });
    this._previewGraphics?.clear();
  };

  private _onPointerMove = (e: any) => {
    if (!this._isDragging) return;
    const p = e.data.global;
    this._dragPath.push({ x: p.x, y: p.y });

    // Draw trail
    if (this._previewGraphics) {
        this._previewGraphics.clear();
        this._previewGraphics.lineStyle(4, 0xffff00, 0.8);
        const localStart = this.toLocal(new PIXI.Point(this._dragPath[0].x, this._dragPath[0].y));
        this._previewGraphics.moveTo(localStart.x, localStart.y);
        
        for (let i = 1; i < this._dragPath.length; i += 2) {
            const localP = this.toLocal(new PIXI.Point(this._dragPath[i].x, this._dragPath[i].y));
            this._previewGraphics.lineTo(localP.x, localP.y);
        }
    }
  };

  private _onPointerUp = (e: any) => {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._previewGraphics?.clear();

    const now = performance.now();
    const duration = Math.max(1, now - this._dragTime);
    
    if (this._dragPath.length < 2) return;

    const first = this._dragPath[0];
    const last = this._dragPath[this._dragPath.length - 1];

    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Filter weak swipes
    if (dist < 40 || dy > 0) return; // Must swipe UP

    // Calculate Power
    const speedFactor = Math.min(2.5, (dist / duration) * 20 + dist / 120);
    
    // Set 3D Velocities (tuned for gentler shots)
    this._vx = dx * 0.045 * speedFactor * this._powerMultiplier;
    this._vy = Math.abs(dy) * 0.03 * speedFactor * this._powerMultiplier; // Altitude lift
    this._vz = Math.max(12, (Math.abs(dy) * 0.05) * speedFactor * this._powerMultiplier);

    // Calculate Spin (Magnus)
    this._curveFactor = this.calculateCurveFactor(first, last, this._dragPath);

    // Reset State
    this._z = 0;
    this._altitude = 0;
    this._isMoving = true;
    this._ballUsed = false;
    this._goalScored = false;
  };

  private calculateCurveFactor(start: {x:number, y:number}, end: {x:number, y:number}, path: any[]) {
     // Find point with max deviation from straight line
     let maxDist = 0;
     const dx = end.x - start.x;
     const dy = end.y - start.y;
     const len = Math.sqrt(dx*dx + dy*dy) || 1;
     
     // Normal vector
     const nx = -dy / len;
     const ny = dx / len;

     for (const p of path) {
         // Project point onto normal vector
         const dist = (p.x - start.x) * nx + (p.y - start.y) * ny;
         if (Math.abs(dist) > Math.abs(maxDist)) maxDist = dist;
     }

     // Tuning: maxDist > 0 usually means curve right (depending on coord system)
     // Adjust constant 0.02 to change spin strength
     return Math.max(-2.5, Math.min(2.5, maxDist * 0.025)); 
  }

  // --- MAIN LOOP ---

  private update() {
    if (!this._isMoving) return;

    // 1. Physics Integration
    this._vx += this._curveFactor * (this._vz / 30); // Magnus effect
    
    // Apply Gravity & Friction
    this._vy -= this.GRAVITY;
    this._vx *= this.FRICTION;
    this._vz *= this.FRICTION;

    // Move positions
    this.x += this._vx;
    this._z += this._vz;
    this._altitude += this._vy;

    // 2. Perspective Projection (2.5D)
    // As Z increases, the "ground" position on screen moves up (vanishing point)
    // We assume the goal is at Z = 800
    const tDepth = this._z / this.GOAL_DISTANCE;
    
    // Get Goal's bottom Y for perspective target
    let targetGroundY = this._groundLevelY - 200; // Default fallback
        if (this.goal && this.goal.goalSprite) {
            // Prefer exact net bottom in world coords and convert to ball-local.
            // This avoids incorrect results when goal and ball live in different containers.
            try {
                const nb = this.goal.goalSprite.getBounds();
                const worldBottomY = 0.7*nb.y + nb.height;
                const worldCenterX = nb.x + nb.width / 2;
                // Convert world point into the coordinate space of the ball's parent (or ball)
                const converter = this.parent || this;
                const localPt = converter.toLocal(new PIXI.Point(worldCenterX, worldBottomY));
                targetGroundY = localPt.y;
            } catch (e) {
                console.warn('ball.ts: failed to compute net bottom local Y', e);
            }
        }
    
    // Interpolate current visual ground Y
    const currentGroundVisualY = this._groundLevelY + (targetGroundY - this._groundLevelY) * Math.min(1, tDepth);
    
    // Final Screen Y = Ground - Altitude
    this.y = currentGroundVisualY - this._altitude;

    // Scale Logic
    const depthScale = Math.max(0.35, 1 - (this._z / 2200));
    const finalScale = this._baseScale * depthScale;
    this.ballSprite.scale.set(finalScale);

    // Visual Rotation
    this.ballSprite.rotation += this._vx * 0.05;

    // 3. Shadow Update
    this.updateShadow(currentGroundVisualY, finalScale);

    // 4. Ground Collision (Bounce)
    if (this._altitude <= 0) {
        this._altitude = 0;
        if (Math.abs(this._vy) > 2) {
            this._vy = -this._vy * 0.5; // Bounce energy loss
            this._vx *= 0.8;
            this._vz *= 0.8;
        } else {
            this._vy = 0;
            // Roll friction
            this._vx *= 0.9; 
            this._vz *= 0.9;
        }
    }

    // 5. Game Logic Checks (Collisions)
    // Only check collision when ball is near the goal depth
    if (this._z >= this.GOAL_DISTANCE && !this._ballUsed) {
        this.checkGameCollisions();
    }

    // Goalkeeper AI Trigger (slightly before goal)
    if (this.goalkeeper && this._z > this.GOAL_DISTANCE * 0.65 && this._vz > 0 && !this._ballUsed && !this._keeperCooldown) {
        this.triggerGoalkeeper();
    }

    // Stop conditions
    if (this._z > 1500 || (Math.abs(this._vx) < 0.1 && Math.abs(this._vz) < 0.1 && this._altitude === 0)) {
        this.finishTurn();
    }
  }

  private updateShadow(groundY: number, scale: number) {
      if (!this.shadowSprite) return;
      this.shadowSprite.clear();
      const shadowAlpha = 0.3 * Math.max(0, 1 - (this._altitude / 300));
      const shadowScale = scale * Math.max(0.5, 1 - (this._altitude / 200));
      
      this.shadowSprite.beginFill(0x000000, shadowAlpha);
      this.shadowSprite.drawEllipse(0, 0, 20 * shadowScale, 10 * shadowScale);
      this.shadowSprite.endFill();
      this.shadowSprite.position.set(0, this._altitude + 15 * scale); // Relative to Container (Ball is 0,0)
  }

  // --- COLLISION LOGIC ---

  private checkGameCollisions() {
      // Priority 1: Check Posts/Crossbar
      if (this.checkPostCollisions()) return;

      // Priority 2: Check Goal (Net)
      // FIX: Added altitude check!
      // Assuming goal height is around 120px-150px in world space (relative to goal sprite)
      const MAX_GOAL_HEIGHT = 140; 
      
      if (this.goal && this.goal.isInGoalArea(this.x, this.y)) {
          if (this._altitude < MAX_GOAL_HEIGHT) {
              // GOAL!
              this.handleGoal();
          } else {
              // OVER THE BAR
              console.log("Over the bar!");
              // Ball continues flying...
          }
      }
  }

  private checkPostCollisions(): boolean {
      if (!this.goal) return false;
      const r = (this.ballSprite.width / 2) * 0.8; // Reduced hitbox for realism

      // Helper for collision
      const checkHit = (obj: any) => {
          if (!obj) return false;
          const bounds = obj.getBounds();
          // Simple circle-rect check in screen space
          const dx = Math.abs(this.x - (bounds.x + bounds.width/2));
          const dy = Math.abs(this.y - (bounds.y + bounds.height/2));

          if (dx > (bounds.width/2 + r)) return false;
          if (dy > (bounds.height/2 + r)) return false;
          return true;
      };

      // Check Left, Right, Crossbar
      if (checkHit(this.goal.leftPost) || checkHit(this.goal.rightPost) || checkHit(this.goal.crossbar)) {
          // Deflect Logic
          spawnImpactEffect(this.parent || this, this.x, this.y);
          this._vz *= -0.4; // Bounce back
          this._vx += (Math.random() - 0.5) * 20; // Random side deflection
          this._vy = Math.abs(this._vy) * 0.8; // Bounce up/down
          return true;
      }
      return false;
  }

  private handleGoal() {
      if (this._goalScored) return;
      this._goalScored = true;
      this._ballUsed = true; // Stop further checks

    spawnImpactEffect(this.parent || this, this.x, this.y);
      
      const zone = this.goal.getZoneFromPosition(this.x, this.y);
      if (this.goalScoredCallback) this.goalScoredCallback(zone);
      
      // Stop ball inside net
            // Clamp depth to goal plane so projection doesn't send the ball off-screen
            this._z = Math.min(this._z, this.GOAL_DISTANCE);
            // Move slightly into the net (gentle forward) but prevent flying further away
            this._vz = Math.min(this._vz, 3);
            this._vx *= 0.2;
            // Give a small downward impulse so the ball falls into the net and settles
            this._vy = -6;
            // Keep moving flag true so update() continues physics until settled
            this._isMoving = true;
  }

  private triggerGoalkeeper() {
      const zone = this.goal.getZoneFromPosition(this.x, this.y);
      const ballRadius = this.ballSprite.width / 2;

      this.goalkeeper.attemptCatch(this.x, this.y, zone, ballRadius).then((result: any) => {
          if (result.caught) {
              this._ballUsed = true; // Keeper caught/blocked it
              this._keeperCooldown = true;
              
              spawnImpactEffect(this.parent || this, this.x, this.y);
              console.log("Saved by Keeper!");
              
              // Physics Deflection
              this._vz *= -0.5; // Bounce out
              this._vy = 10;    // Pop up
              this._vx = (Math.random() > 0.5 ? 15 : -15);

              if (this.saveCallback) this.saveCallback();
              
              setTimeout(() => this._keeperCooldown = false, 1000);
          }
      });
  }

  private finishTurn() {
      if (!this._isMoving) return;
      this._isMoving = false;
      
      if (!this._goalScored && !this._ballUsed) {
          if (this.outCallback) this.outCallback();
      }

      if (this.onBallDestroyed) {
          setTimeout(this.onBallDestroyed, 1000);
      }
  }

  public destroy() {
      PIXI.Ticker.shared.remove(this.onEnterFrame);
      this.removeAllListeners();
      super.destroy();
  }
}