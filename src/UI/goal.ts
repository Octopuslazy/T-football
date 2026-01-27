import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';

export default class Goal extends PIXI.Container {
  public goalSprite: PIXI.Sprite; // Chuyển sang public để Ball truy cập nếu cần
  public netSprite: PIXI.Sprite;
  
  // Các hitbox vật lý (Sẽ được add vào Goal để đi theo toạ độ)
  public leftPost: PIXI.Graphics;
  public rightPost: PIXI.Graphics;
  public crossbar: PIXI.Graphics;
  // Front visuals (visible red rectangles)
  public frontLeftVis: PIXI.Graphics;
  public frontRightVis: PIXI.Graphics;
  
  private zoneVisualization: PIXI.Graphics;
  private _circleAlpha: number = 0.22;
  private _onResize: () => void;
  private _showGrid: boolean = false;
  private showZones: boolean = false; // Mặc định tắt debug zone
  private _showNetHitbox: boolean = false; 
  private _interactionZones: Array<{ type: 'green'|'yellow'; rectLocal: { x:number;y:number;w:number;h:number }; gfx?: PIXI.Graphics | null }> = [];

  constructor() {
    super();
    
    // 1. Goal Sprite (Khung thành dính liền)
    const tex = PIXI.Texture.from('./arts/goal.png');
    this.goalSprite = new PIXI.Sprite(tex);
    this.goalSprite.anchor.set(0.5, 0); 
    
    // 2. Net Sprite (Lưới)
    const netTex = PIXI.Texture.from('./arts/net.png');
    this.netSprite = new PIXI.Sprite(netTex);
    this.netSprite.anchor.set(0.5, 0); 
    this.netSprite.alpha = 1; // Hiện lưới bình thường (nằm sau bóng)
    
    // 3. Tạo các HITBOX Cột/Xà (Quan trọng: Phải add vào Goal)
    this.leftPost = new PIXI.Graphics();
    this.rightPost = new PIXI.Graphics();
    this.crossbar = new PIXI.Graphics();

    // 3b. Front visible post rectangles (red) — shown as visual guides
    this.frontLeftVis = new PIXI.Graphics();
    this.frontRightVis = new PIXI.Graphics();
    this.frontLeftVis.visible = true;
    this.frontRightVis.visible = true;
    
    // Debug Hitbox: Để alpha = 0.5 khi dev để thấy, = 0 khi release
    // Hitbox này sẽ nằm cùng layer với Goal, giúp Ball tính toán va chạm đúng toạ độ
    this.leftPost.alpha = 0; 
    this.rightPost.alpha = 0;
    this.crossbar.alpha = 0;

    this.zoneVisualization = new PIXI.Graphics();
    
    // --- THÊM VÀO CONTAINER (QUAN TRỌNG) ---
    // Thứ tự vẽ:
    // 1. Lưới (Dưới cùng)
    this.addChild(this.netSprite);
    // 2. Khung thành visual (Dưới bóng hoặc trên tuỳ logic layer của bạn)
    this.addChild(this.goalSprite);
    // 3. Các Hitbox (Vô hình)
    this.addChild(this.leftPost);
    this.addChild(this.rightPost);
    this.addChild(this.crossbar);
    // 3b. Add front visuals above goal frame so they are visible
    this.addChild(this.frontLeftVis);
    this.addChild(this.frontRightVis);
    // 4. Debug Zone
    this.addChild(this.zoneVisualization);

    this._onResize = this.updateScale.bind(this);
    window.addEventListener('resize', this._onResize);

    // Init Scale
    if (this.goalSprite.texture && this.goalSprite.texture.width) {
      this.updateScale();
    } else {
      this.goalSprite.texture.on('update', () => this.updateScale());
    }
  }
  public getFrontLayer(): PIXI.Container {
    const frontLayer = new PIXI.Container();
    
    const frontLeft = new PIXI.Graphics();
    const frontRight = new PIXI.Graphics();
    const frontBar = new PIXI.Graphics();
    
    return frontLayer; 
  }

  updateScale() {
    if (!this.goalSprite.texture || !this.goalSprite.texture.width) return;

    // Scale logic
    const targetWidth = (BASE_WIDTH / 2) * 1.83; 
    const s = targetWidth / this.goalSprite.texture.width;
    
    this.goalSprite.scale.set(s, s);
    this.goalSprite.x = Math.round(BASE_WIDTH / 2);
    this.goalSprite.y = Math.round(BASE_HEIGHT * 1 / 5.22);

    if (this.netSprite.texture) {
      this.netSprite.scale.set(s, s);
      this.netSprite.x = this.goalSprite.x;
      this.netSprite.y = this.goalSprite.y;
    }

    // Cập nhật Hitbox Cột/Xà
    this.updateGoalPostsHitbox(s);
    
    this.drawZoneVisualization();
    try { this.setupInteractionZones(); } catch (e) {}
  }

  // Vẽ lại Hitbox hình chữ nhật khớp với hình ảnh cột gôn
  private updateGoalPostsHitbox(scale: number) {
    // Kích thước ước lượng của cột trên hình ảnh (cần tinh chỉnh cho khớp art)
    const postThickness = 15 * scale; // Độ dày cột
    const barHeight = 12 * scale;     // Độ dày xà
    
    const goalBounds = this.goalSprite.getLocalBounds(); // Lấy bounds gốc chưa scale
    // Vì goalSprite anchor (0.5, 0), toạ độ local:
    // x từ -width/2 đến width/2
    // y từ 0 đến height
    
    const w = goalBounds.width * scale;
    const h = goalBounds.height * scale;
    
    const gx = this.goalSprite.x;
    const gy = this.goalSprite.y;

    // 1. Left Post Hitbox
    this.leftPost.clear();
    this.leftPost.beginFill(0xFF0000, 0.5); // Màu đỏ debug
    // Vị trí cột trái tính từ tâm: x = gx - w/2
    this.leftPost.drawRect(0, 0, postThickness, h); 
    this.leftPost.endFill();
    this.leftPost.x = gx - w/2;
    this.leftPost.y = gy;

    // 2. Right Post Hitbox
    this.rightPost.clear();
    this.rightPost.beginFill(0xFF0000, 0.5);
    // Vị trí cột phải: x = gx + w/2 - thickness
    this.rightPost.drawRect(0, 0, postThickness, h);
    this.rightPost.endFill();
    this.rightPost.x = gx + w/2 - postThickness;
    this.rightPost.y = gy;

    // 3. Crossbar Hitbox
    this.crossbar.clear();
    this.crossbar.beginFill(0xFF0000, 0.5);
    this.crossbar.drawRect(0, 0, w, barHeight);
    this.crossbar.endFill();
    this.crossbar.x = gx - w/2;
    this.crossbar.y = gy;

    // 4. Front visible rectangles (match left/right post positions)
    try {
      // Draw slanted red bars: draw rect centered at pivot then rotate
      this.frontLeftVis.clear();
      this.frontLeftVis.beginFill(0xFF0000, 0.95);
      // draw rect around origin so pivot rotation keeps it aligned
      this.frontLeftVis.drawRect(-postThickness / 2.3, -h / 2.3, postThickness, h/1.3);
      this.frontLeftVis.endFill();
      // position pivot at visual center of the left post
      this.frontLeftVis.x = gx - w / 2.4 + postThickness / 2;
      this.frontLeftVis.y = gy + h / 2;
      this.frontLeftVis.rotation = -0.15; // ~-20 degrees

      this.frontRightVis.clear();
      this.frontRightVis.beginFill(0xFF0000, 0.95);
      this.frontRightVis.drawRect(-postThickness / 2.3, -h / 2.3, postThickness, h/1.3);
      this.frontRightVis.endFill();
      this.frontRightVis.x = gx + w / 2.42 - postThickness / 1.3;
      this.frontRightVis.y = gy + h / 2;
      this.frontRightVis.rotation = 0.15; // ~20 degrees
    } catch (e) {}
  }
  
  // Get goal area for scoring (inside the goal)
  public getGoalArea() {
    // Dùng Hitbox đã setup chuẩn ở trên để tính vùng gôn
    const lx = this.leftPost.x + this.leftPost.width; // Mép trong cột trái
    const rx = this.rightPost.x; // Mép trong cột phải
    const by = this.crossbar.y + this.crossbar.height; // Mép dưới xà
    const bottom = this.leftPost.y + this.leftPost.height;

    // Chuyển sang Local của Goal Container (thực ra hitbox đã là con trực tiếp nên x,y là local rồi)
    // Nhưng getGoalArea thường trả về Global hoặc Local tuỳ logic game. 
    // Code cũ của bạn có vẻ muốn trả về Local Relative to Goal Container.
    
    return {
        x: lx,
        y: by,
        width: rx - lx,
        height: bottom - by
    };
  }

  // Get 12 goal zones (3 rows x 4 columns)
  public getGoalZones() {
    const goalArea = this.getGoalArea();
    const zoneWidth = goalArea.width / 4;
    const zoneHeight = goalArea.height / 3;
    
    const zones = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        zones.push({
          id: row * 4 + col + 1, // Zone ID 1-12
          row: row,
          col: col,
          x: goalArea.x + col * zoneWidth,
          y: goalArea.y + row * zoneHeight,
          width: zoneWidth,
          height: zoneHeight
        });
      }
    }
    
    return zones;
  }

  // Check which zone the ball hit (returns zone info or null)
  public getZoneFromPosition(ballX: number, ballY: number) {
    const zones = this.getGoalZones();
    
    for (const zone of zones) {
      if (ballX >= zone.x && 
          ballX <= zone.x + zone.width &&
          ballY >= zone.y && 
          ballY <= zone.y + zone.height) {
        return zone;
      }
    }
    
    return null; // Not in any zone
  }

  // Check if ball is in goal area at all
  public isInGoalArea(ballX: number, ballY: number) {
    const goalArea = this.getGoalArea();
    return ballX >= goalArea.x && 
           ballX <= goalArea.x + goalArea.width &&
           ballY >= goalArea.y && 
           ballY <= goalArea.y + goalArea.height;
  }
  private setupInteractionZones() {
     try {
       this._interactionZones = [];
       const goalArea = this.getGoalArea();
       const gw = goalArea.width;
       const gh = goalArea.height;

       // Ví dụ: Tạo vùng xanh lá cây bên ngoài cột
       const greenW = Math.max(24, Math.min(60, gw * 0.08));
       const gLeft = { x: -greenW - 6, y: 0, w: greenW, h: gh };
       const gRight = { x: gw + 6, y: 0, w: greenW, h: gh };

       this._interactionZones.push({ type:'green', rectLocal: gLeft, gfx: null });
       this._interactionZones.push({ type:'green', rectLocal: gRight, gfx: null });
     } catch(e) {}
   }

  // Draw visual representation of the 12 zones
  private drawZoneVisualization() {
    if (!this.showZones) return;
    
    this.zoneVisualization.clear();

    const zones = this.getGoalZones();
    const goalArea = this.getGoalArea();

    // Draw scoring grid (optional) using light outlines and center markers.
    // Zones and goalArea are returned in world coordinates; convert each
    // rect into this container's local space before drawing so visuals
    // align with other global/world-based calculations (keeper, ball).
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];

      // `getGoalZones()` returns coordinates in this container's local space
      // so use them directly rather than converting again with `toLocal()`.
      const localX = zone.x;
      const localY = zone.y;
      const localW = zone.width;
      const localH = zone.height;

      if (this._showGrid) {
        this.zoneVisualization.lineStyle(2, 0x880000, 0);
        this.zoneVisualization.rect(localX, localY, localW, localH);
      }

      // center marker (red circle) — make visible with modest alpha
      if (this._showGrid) {
        const centerLocalX = localX + localW / 2;
        const centerLocalY = localY + localH / 2;
        const circleRadiusLocal = (localH / 4) / 2;
        this.zoneVisualization.beginFill(0xFF0000, this._circleAlpha);
        this.zoneVisualization.drawCircle(centerLocalX, centerLocalY, Math.max(4, circleRadiusLocal));
        this.zoneVisualization.endFill();
      }
    }
    

    // Also draw the interaction rectangles (green / red / yellow) explicitly so they match
    // the setupInteractionZones definitions. Draw them at absolute positions (goalArea-based)
    try {
      const gx = goalArea.x;
      const gy = goalArea.y;
      const gw = goalArea.width;
      const gh = goalArea.height;


      // Green (outside posts) - draw visible guide rectangles - COMMENTED OUT
      /*
      const greenW = Math.max(24, Math.min(60, gw * 0.08));
      const greenLeft = { x: gx - greenW + 6, y: gy, w: greenW-40, h: gh-40 };
      const greenRight = { x: gx + gw - 2, y: gy, w: greenW-40, h: gh-40 };
      this.zoneVisualization.fill(0x00FF00, 0.18);
      this.zoneVisualization.rect(greenLeft.x, greenLeft.y, greenLeft.w, greenLeft.h);
      this.zoneVisualization.rect(greenRight.x, greenRight.y, greenRight.w, greenRight.h);
      this.zoneVisualization.fill();
      */

      // Yellow (inside near posts) - COMMENTED OUT
      /*
      const yellowH = Math.max(8, gh * 0.12);
      const yellowWSide = Math.max(3, gw * 0.1);
      const yellowWSideSmall = Math.max(10, Math.round(yellowWSide * 0.5));
      const yellowShiftX = -5;
      const yellowLeft = { x: gx +13 + Math.max(1, gw * 0.03)-30 + yellowShiftX, y: gy + Math.max(6, gh * 0.03), w: yellowWSideSmall-20, h: yellowH+300 };
      const yellowRight = { x: gx +12 + gw - yellowWSideSmall - Math.max(6, gw * 0.03) + yellowShiftX, y: gy + Math.max(6, gh * 0.03), w: yellowWSideSmall-20, h: yellowH+300 };
      // Yellow crossbar: draw a thin yellow rect just inside the red crossbar
      
      this.zoneVisualization.fill(0xFFFF00, 0.35);
      this.zoneVisualization.rect(yellowLeft.x, yellowLeft.y, yellowLeft.w, yellowLeft.h);
      this.zoneVisualization.rect(yellowRight.x, yellowRight.y, yellowRight.w, yellowRight.h);
      // Draw the yellow crossbar inset slightly so it's visibly inside the red crossbar
      this.zoneVisualization.rect(yellowCrossbar.x, yellowCrossbar.y, yellowCrossbar.w, yellowCrossbar.h);
      this.zoneVisualization.fill();
      */
    } catch (e) {}

    // Draw blue net hitbox rectangle using the visual net sprite bounds
    // (use net sprite local coordinates so the rectangle matches what is drawn)
    try {
      if (this._showNetHitbox && this.netSprite) {
        // netSprite uses anchor (0.5, 0) in updateScale; compute top-left from that
        const netW = this.netSprite.width || 0;
        const netH = this.netSprite.height || 0;
        const netLeft = (this.netSprite.x || 0) - netW * (this.netSprite.anchor.x || 0);
        const netTop = (this.netSprite.y || 0) - netH * (this.netSprite.anchor.y || 0);
        const localX = Math.round(netLeft);
        const localY = Math.round(netTop);
        const localW = Math.round(netW);
        const localH = Math.round(netH);
        this.zoneVisualization.lineStyle(2, 0x0077FF, 0);
        this.zoneVisualization.beginFill(0x0077FF, 0);
        this.zoneVisualization.drawRect(localX, localY, localW, localH);
        this.zoneVisualization.endFill();
      }
    } catch (e) {}
  }
  
  // Toggle zone visualization on/off
  public toggleZoneVisualization() {
    this.showZones = !this.showZones;
    if (this.showZones) {
      this.drawZoneVisualization();
    } else {
      this.zoneVisualization.clear();
    }
  }

  // Show/hide blue net hitbox rectangle
  public setNetHitboxVisible(show: boolean) {
    this._showNetHitbox = !!show;
    if (this.showZones) this.drawZoneVisualization();
  }

  // Public API: set the fill alpha for the red zone center circles (0..1)
  public setCircleAlpha(a: number) {
    const v = typeof a === 'number' && isFinite(a) ? a : this._circleAlpha;
    this._circleAlpha = Math.max(0, Math.min(1, v));
    if (this.showZones) this.drawZoneVisualization();
  }

  // Public API to show/hide the grid lines (rect outlines)
  public setGridVisible(show: boolean) {
    this._showGrid = !!show;
    if (this.showZones) this.drawZoneVisualization();
  }

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}
