import * as PIXI from 'pixi.js';

export default class Goalkeeper extends PIXI.Container {
  private goalkeeperSprite: PIXI.Sprite;
  private _onResize: () => void;
  private _initialPosition: { x: number; y: number } = { x: 0, y: 0 };
  private _initialRotation: number = 0;
  private _isActive: boolean = true;
  private _isAnimating: boolean = false;
  private _catchProbability: number = 0.7; // Tỉ lệ bắt bóng
  private _goal: any = null;
  private _lastActionTime: number = 0; // Biến lưu thời gian thực hiện hành động cuối
  private _actionCooldown: number = 1500; // Thời gian hồi chiêu (ms) để tránh nhảy 2 lần
  
  constructor() {
    super();
    
    // Create goalkeeper sprite (starting with gkeeper.png)
    const tex = PIXI.Texture.from('./arts/gkeeper.png');
    this.goalkeeperSprite = new PIXI.Sprite(tex);
    this.goalkeeperSprite.anchor.set(0.5, 0.8); // mid-bottom anchor
    
    this.addChild(this.goalkeeperSprite);
    
    this._onResize = this.updateScale.bind(this);
    window.addEventListener('resize', this._onResize);
    
    // Initial setup
    this.updateScale();
    this.reset();
  }
  
  // Reset goalkeeper to initial position and state
  public reset() {
    this.x = this._initialPosition.x;
    this.y = this._initialPosition.y;
    this.rotation = this._initialRotation;
    
    // Reset to normal goalkeeper sprite
    const normalTexture = PIXI.Texture.from('./arts/gkeeper.png');
    this.goalkeeperSprite.texture = normalTexture;
    
    this._isActive = true;
    this._isAnimating = false;
    this._lastActionTime = 0; // Reset cooldown
  }
  
  // Set initial position (called when positioning goalkeeper)
  public setInitialPosition(x: number, y: number) {
    this._initialPosition = { x, y };
    this.x = x;
    this.y = y;
  }
  
  // Update goalkeeper scale based on goal size
  updateScale() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Scale goalkeeper as 0.6 times the goal scale
    const devicePixel = (window && (window.devicePixelRatio || 1)) || 1;
    const rawScreenFactor = Math.min(screenWidth / 1920, screenHeight / 1080);
    const clampedScreenFactor = Math.max(0.6, Math.min(rawScreenFactor, 1.4));
    const screenFactor = clampedScreenFactor * devicePixel;

    let baseScale = 0.6 * screenFactor;
    if (this._goal && this._goal.scale) {
      const sx = typeof this._goal.scale.x === 'number' ? this._goal.scale.x : 1;
      const sy = typeof this._goal.scale.y === 'number' ? this._goal.scale.y : sx;
      const goalScale = (sx + sy) / 2;
      baseScale = goalScale * 0.6 * screenFactor;
    } else {
      const goalLikeScale = Math.min(screenWidth / 1920, screenHeight / 1080) * 0.8;
      baseScale = goalLikeScale * 0.6 * screenFactor;
    }

    this.scale.set(baseScale);
    
    if (this._goal && this._goal.getGoalArea) {
      const goalArea = this._goal.getGoalArea();
      const goalCenterX = goalArea.x + goalArea.width / 2;
      const goalBottomY = goalArea.y + goalArea.height - 20;
      this.setInitialPosition(goalCenterX, goalBottomY);
    } else {
      const goalCenterX = screenWidth / 2;
      const goalBottomY = screenHeight * 0.5;
      this.setInitialPosition(goalCenterX, goalBottomY);
    }
  }
  
  public setGoal(goal: any) {
    this._goal = goal;
    this.updateScale();
  }
  
  // Calculate target position for diving to a specific zone
  private getPositionForZone(zoneId: number): { x: number; y: number } {
    const baseX = this._initialPosition.x;
    const baseY = this._initialPosition.y;
    
    // Tăng khoảng cách nhảy để fallback (khi không bắt trúng bóng) trông xa hơn
    const diveDistance = 220; 
    
    let targetX = baseX;
    let targetY = baseY;
    
    switch(zoneId) {
      case 1: targetX = baseX - diveDistance; targetY = baseY - diveDistance; break;
      case 2: targetX = baseX - diveDistance * 0.5; targetY = baseY - diveDistance; break;
      case 3: targetX = baseX + diveDistance * 0.5; targetY = baseY - diveDistance; break;
      case 4: targetX = baseX + diveDistance; targetY = baseY - diveDistance; break;
      case 5: targetX = baseX - diveDistance; targetY = baseY; break;
      case 6: targetX = baseX - diveDistance * 0.5; targetY = baseY; break;
      case 7: targetX = baseX + diveDistance * 0.5; targetY = baseY; break;
      case 8: targetX = baseX + diveDistance; targetY = baseY; break;
      case 9: targetX = baseX - diveDistance; targetY = baseY + diveDistance * 0.5; break;
      case 10: targetX = baseX - diveDistance * 0.5; targetY = baseY + diveDistance * 0.5; break;
      case 11: targetX = baseX + diveDistance * 0.5; targetY = baseY + diveDistance * 0.5; break;
      case 12: targetX = baseX + diveDistance; targetY = baseY + diveDistance * 0.5; break;
      default:
        const angle = Math.random() * Math.PI * 2;
        targetX = baseX + Math.cos(angle) * diveDistance;
        targetY = baseY + Math.sin(angle) * diveDistance * 0.7;
        break;
    }
    
    return { x: targetX, y: targetY };
  }
  
  private getRotationForZone(zoneId: number): number {
    let rotation = 0;
    switch(zoneId) {
      case 1: rotation = -0.4; break;
      case 2: rotation = -0.2; break;
      case 3: rotation = 0.2; break;
      case 4: rotation = 0.4; break;
      case 5: rotation = -0.5; break;
      case 6: rotation = -0.2; break;
      case 7: rotation = 0.2; break;
      case 8: rotation = 0.5; break;
      case 9: rotation = -0.3; break;
      case 10: rotation = -0.1; break;
      case 11: rotation = 0.1; break;
      case 12: rotation = 0.3; break;
      default: rotation = 0; break;
    }
    return rotation;
  }
  
  // Attempt to catch ball at specific zone
  public attemptCatch(ballX: number, ballY: number, targetZone: any, ballRadius: number = 20): Promise<{ caught: boolean; catchZone?: any; catchPos?: { x: number; y: number } }> {
    return new Promise((resolve) => {
      // 1. Check trạng thái Active và Animating
      if (!this._isActive || this._isAnimating) {
        resolve({ caught: false });
        return;
      }

      // 2. CHECK COOLDOWN (Fix lỗi nhảy 2 lần)
      // Nếu vừa mới nhảy trong vòng 1.5 giây, không nhảy nữa
      const now = Date.now();
      if (now - this._lastActionTime < this._actionCooldown) {
        console.log("Goalkeeper is in cooldown, skipping jump.");
        resolve({ caught: false });
        return;
      }
      
      const willAttemptCatch = Math.random() < this._catchProbability;
      
      if (!willAttemptCatch) {
        // Even if roll fails, perform a random miss-dive so keeper appears to attempt elsewhere
        this._lastActionTime = now;
        this._isAnimating = true;
        this._isActive = false;

        let missZone = targetZone;
        if (!targetZone || !this.isValidTargetZone(ballX, ballY, targetZone)) {
          missZone = this.getRandomZone();
        }

        this.performFailedCatchAnimation(missZone).then((pos) => {
          // return a deflect position to Ball (avoid actual ball position)
          const deflect = this.getRandomDeflectPosition({ x: ballX, y: ballY });
          resolve({ caught: false, catchZone: missZone, catchPos: deflect });
        }).catch(() => { resolve({ caught: false }); });
        return;
      }

      // Set cooldown start time ngay khi quyết định nhảy (successful roll)
      this._lastActionTime = now;
      this._isAnimating = true;
      this._isActive = false;
      
      let catchZone = targetZone;
      if (!targetZone || !this.isValidTargetZone(ballX, ballY, targetZone)) {
        catchZone = this.getRandomZone();
      }
      
      const canReach = this.canReachZone(catchZone, ballX, ballY);
      
      if (!canReach) {
        this.performFailedCatchAnimation(catchZone).then((pos) => {
          resolve({ caught: false, catchZone, catchPos: pos });
        }).catch(() => { resolve({ caught: false }); });
        return;
      }
      
      // Truyền tọa độ bóng chính xác để thủ môn bay tới
      this.performCatchAnimation(catchZone, { x: ballX, y: ballY }).then((pos) => {
        resolve({ caught: true, catchZone, catchPos: pos });
      }).catch(() => { resolve({ caught: false }); });
    });
  }
  
  private canReachZone(catchZone: any, ballX: number, ballY: number): boolean {
    const goalArea = this._goal?.getGoalArea();
    if (!goalArea) return true;
    
    const ballToGoalCenterX = Math.abs(ballX - (goalArea.x + goalArea.width / 2));
    const ballToGoalCenterY = Math.abs(ballY - (goalArea.y + goalArea.height / 2));
    
    const maxDistanceX = goalArea.width * 1.5;
    const maxDistanceY = goalArea.height * 1.5;
    
    return ballToGoalCenterX <= maxDistanceX && ballToGoalCenterY <= maxDistanceY;
  }
  
  private performFailedCatchAnimation(zone: any): Promise<{ x: number; y: number }> {
    return new Promise((resolve) => {
      this._isAnimating = true;
      this._isActive = false;
      
      const targetRotation = this.getRotationForZone(zone.id);
      const targetPosition = this.getPositionForZone(zone.id);
      
      const catchTexture = PIXI.Texture.from('./arts/gkeeper2.png');
      this.goalkeeperSprite.texture = catchTexture;
      
      const startRotation = this.rotation;
      const startX = this.x;
      const startY = this.y;
      
      const rotationDiff = targetRotation - startRotation;
      const positionDiffX = (targetPosition.x - startX) * 0.7; 
      const positionDiffY = (targetPosition.y - startY) * 0.7;
      
      const animationDuration = 300; 
      const startTime = Date.now();
      
      const animateDive = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const easedProgress = this.easeOutCubic(progress);
        
        this.rotation = startRotation + (rotationDiff * easedProgress);
        this.x = startX + (positionDiffX * easedProgress);
        this.y = startY + (positionDiffY * easedProgress);
        
        if (progress < 1) {
          requestAnimationFrame(animateDive);
        } else {
            // When miss, return a random deflect position (not the actual ball snap)
            const deflectPos = this.getRandomDeflectPosition();
            this.fallToGround().then(() => {
              resolve(deflectPos);
            }).catch(() => { resolve(deflectPos); });
        }
      };
      
      animateDive();
    });
  }
  
  private isValidTargetZone(ballX: number, ballY: number, zone: any): boolean {
    return zone && zone.id >= 1 && zone.id <= 12;
  }
  
  private getRandomZone(): any {
    const randomZoneId = Math.floor(Math.random() * 12) + 1;
    return {
      id: randomZoneId,
      row: Math.floor((randomZoneId - 1) / 4),
      col: (randomZoneId - 1) % 4
    };
  }

    // Get a random deflect position (used when keeper misses) - avoid returning the actual ball position when possible
    private getRandomDeflectPosition(avoid?: { x: number; y: number }): { x: number; y: number } {
      const goalArea = this._goal?.getGoalArea?.();
      if (!goalArea) {
        // fallback near keeper
        const offsetX = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120);
        const offsetY = -20 + Math.random() * 80;
        return { x: this._initialPosition.x + offsetX, y: this._initialPosition.y + offsetY };
      }

      // pick a random side (left/right/top) away from the center
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side === -1 ? goalArea.x - 40 - Math.random() * 80 : goalArea.x + goalArea.width + 40 + Math.random() * 80;
      const y = goalArea.y + Math.random() * goalArea.height * 0.8 + goalArea.height * 0.1;

      const pos = { x, y };
      if (avoid) {
        const dx = pos.x - avoid.x;
        const dy = pos.y - avoid.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 60) {
          // shift further out
          pos.x += side * 80;
          pos.y += (Math.random() - 0.5) * 80;
        }
      }

      return pos;
    }
  
  // LOGIC BẮT BÓNG MỚI (Bay thẳng tới bóng & Độ dài tay)
  private performCatchAnimation(zone: any, catchWorldPos?: { x: number; y: number }): Promise<{ x: number; y: number }> {
    return new Promise((resolve) => {
      this._isAnimating = true;
      this._isActive = false;
      
      const catchTexture = PIXI.Texture.from('./arts/gkeeper2.png');
      this.goalkeeperSprite.texture = catchTexture;

      // 1. Xác định đích đến (Vị trí bóng)
      let targetX = 0;
      let targetY = 0;

      if (catchWorldPos) {
        let localPoint = { x: catchWorldPos.x, y: catchWorldPos.y };
        if (this.parent && (this.parent as any).toLocal) {
            const p = (this.parent as any).toLocal(new PIXI.Point(catchWorldPos.x, catchWorldPos.y));
            localPoint = { x: p.x, y: p.y };
        }
        targetX = localPoint.x;
        targetY = localPoint.y;
      } else {
        const defaultPosition = this.getPositionForZone(zone.id);
        targetX = this.x + (defaultPosition.x - this.x) * 2.5; 
        targetY = defaultPosition.y;
      }

      // 2. Tính toán vị trí cơ thể dựa trên Độ Dài Tay (Arm Length)
      // TĂNG GIẢM SỐ NÀY để chỉnh khoảng cách tiếp xúc
      const armLength = 80 * (this.scale.x || 1); 

      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const angle = Math.atan2(dy, dx);

      // Cơ thể bay tới gần bóng, trừ đi độ dài tay
      const finalBodyX = targetX - Math.cos(angle) * armLength;
      const finalBodyY = targetY - Math.sin(angle) * armLength;

      const startX = this.x;
      const startY = this.y;
      const startRotation = this.rotation;

      // Góc xoay hướng về bóng
      let targetRotation = angle; 
      if (zone.id <= 4) targetRotation = -0.5 * Math.sign(dx); 
      else if (zone.id >= 9) targetRotation = 0.2 * Math.sign(dx); 
      else targetRotation = angle * 0.5;

      const rotationDiff = targetRotation - startRotation;
      const distBodyX = finalBodyX - startX;
      const distBodyY = finalBodyY - startY;

      const animationDuration = 450;
      const startTime = Date.now();
      let resolved = false;

      // Độ cao nhảy tạo đường cong
      const jumpHeight = 120 * (this.scale.x || 1); 

      const animateDive = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const easedProgress = this.easeOutCubic(progress);

        this.x = startX + (distBodyX * easedProgress);

        const linearY = startY + (distBodyY * easedProgress);
        // Tại progress=1, arc=0 => Thủ môn đáp đúng vị trí đã tính
        const arc = Math.sin(progress * Math.PI) * jumpHeight; 
        this.y = linearY - arc; 

        this.goalkeeperSprite.rotation = startRotation + (rotationDiff * easedProgress);

        if (!resolved && progress >= 0.5) {
          resolved = true;
          resolve({ x: this.x, y: this.y });
        }

        if (progress < 1) {
          requestAnimationFrame(animateDive);
        } else {
          // Xong animation, chờ rồi ngã
          setTimeout(() => { try { this.fallToGround(); } catch (e) {} }, 150);
        }
      };

      requestAnimationFrame(animateDive);
    });
  }
  
  private fallToGround(): Promise<void> {
    return new Promise((resolve) => {
      const currentX = this.x;
      const currentY = this.y;
      
      // Lúc bay ta xoay Sprite, nhưng lúc ngã ta xoay cả Container nên cần lấy góc hiện tại
      // Tuy nhiên để đơn giản, ta sẽ animate Container về 0, và quan trọng nhất là reset Sprite ở cuối
      const currentRotation = this.rotation; 
      
      // Target position: back to initial position (ground level)
      const targetX = this._initialPosition.x;
      const targetY = this._initialPosition.y;
      const targetRotation = this._initialRotation;
      
      // Calculate differences
      const diffX = targetX - currentX;
      const diffY = targetY - currentY;
      const diffRotation = targetRotation - currentRotation;
      
      const fallDuration = 500; // ms - falling animation duration
      const startTime = Date.now();
      
      const animateFall = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / fallDuration, 1);
        
        // Use gravity-like easing (faster falling)
        const easedProgress = this.easeInQuad(progress);
        
        // Animate back to ground position
        this.x = currentX + (diffX * easedProgress);
        this.y = currentY + (diffY * easedProgress);
        this.rotation = currentRotation + (diffRotation * easedProgress);
        
        if (progress < 1) {
          requestAnimationFrame(animateFall);
        } else {
          // Ensure exact final position
          this.x = targetX;
          this.y = targetY;
          this.rotation = targetRotation;
          
          // Reset goalkeeper to normal state after falling
          const normalTexture = PIXI.Texture.from('./arts/gkeeper.png');
          this.goalkeeperSprite.texture = normalTexture;

          // --- SỬA LỖI Ở ĐÂY ---
          // Bắt buộc reset góc xoay của Sprite ảnh về 0
          // Vì lúc bay ta đã xoay nó, nếu không reset nó sẽ bị nghiêng vĩnh viễn
          this.goalkeeperSprite.rotation = 0; 
          // ---------------------

          // Reset flags and active state
          this._isAnimating = false;
          this._isActive = true;

          resolve();
        }
      };
      
      animateFall();
    });
  }
  
  private easeInQuad(t: number): number {
    return t * t;
  }
  
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  public shouldAttemptCatch(ballX: number, ballY: number, ballVelocity: { x: number; y: number }): boolean {
    return ballVelocity.x > 0 && this._isActive;
  }
  
  public getState() {
    return {
      position: { x: this.x, y: this.y },
      rotation: this.rotation,
      isActive: this._isActive,
      texture: this.goalkeeperSprite.texture.label
    };
  }
  
  public getBounds() {
    return this.goalkeeperSprite.getBounds();
  }
  
  public getCollisionRadius(): number {
    return 40 * (this.scale?.x || 1);
  }
  
  public setCatchProbability(probability: number) {
    this._catchProbability = Math.max(0, Math.min(1, probability));
  }
  
  public getCatchProbability(): number {
    return this._catchProbability;
  }
  
  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}