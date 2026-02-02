import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';
import { addToLayer, Layer } from '../ControllUI/layers';

export default class Goal extends PIXI.Container {
 
  public goalSprite: PIXI.Sprite; // Exposed as public so Ball can access if needed
  public netSprite: PIXI.Sprite;
  
  // Physical hitboxes (added to Goal so they follow its coordinates)
  public leftPost: PIXI.Graphics;
  public rightPost: PIXI.Graphics;
  public crossbar: PIXI.Graphics;
  // Front debug visuals (visible guides in front of net)
  public frontLeftVis!: PIXI.Graphics;
  public frontRightVis!: PIXI.Graphics;
  // Horizontal front guides (left/right)
  public frontLeftHorVis!: PIXI.Graphics;
  public frontRightHorVis!: PIXI.Graphics;
  // Second pair of horizontal guides placed slightly higher (Y * 1.1)
  public frontLeftHorVis2!: PIXI.Graphics;
  public frontRightHorVis2!: PIXI.Graphics;
  
  private zoneVisualization: PIXI.Graphics;
  private _circleAlpha: number = 0.22;
  private _onResize: () => void;
  private _showGrid: boolean = false;
  private showZones: boolean = false; // Debug zones are off by default
  private _showNetHitbox: boolean = false; 
  private _interactionZones: Array<{ type: 'green'|'yellow'; rectLocal: { x:number;y:number;w:number;h:number }; gfx?: PIXI.Graphics | null }> = [];

  constructor() {
    super();
    
   
    // 1. Goal Sprite (visual frame)
    const tex = PIXI.Texture.from('/Assets/arts/goal.png');
    this.goalSprite = new PIXI.Sprite(tex);
    this.goalSprite.anchor.set(0.5, 0); 
    // Hide visual goal sprite (keep net visible)
    this.goalSprite.alpha = 0;
    
   
    // 2. Net Sprite (net)
    const netTex = PIXI.Texture.from('/Assets/arts/net.png');
    this.netSprite = new PIXI.Sprite(netTex);
    this.netSprite.anchor.set(0.5, 0); 
    this.netSprite.alpha = 1; // Show net normally (sits behind the ball)
    
    // 3. Create HITBOX for posts/crossbar (Important: add to Goal)
    this.leftPost = new PIXI.Graphics();
    this.rightPost = new PIXI.Graphics();
    this.crossbar = new PIXI.Graphics();
    
    // Debug hitbox: set alpha=0.5 during dev to see, =0 on release
    // This hitbox lives in the same container as Goal so Ball collision math uses consistent coordinates
    this.leftPost.alpha = 0; 
    this.rightPost.alpha = 0;
    this.crossbar.alpha = 0;

    this.zoneVisualization = new PIXI.Graphics();
    // Front visuals container (for drawing debug guides in front of the net)
    this.frontLeftVis = new PIXI.Graphics();
    this.frontRightVis = new PIXI.Graphics();
    // this.frontLeftHorVis = new PIXI.Graphics(); // disabled
    // this.frontRightHorVis = new PIXI.Graphics(); // disabled
    // this.frontLeftHorVis2 = new PIXI.Graphics(); // disabled
    // this.frontRightHorVis2 = new PIXI.Graphics(); // disabled
    // Make them invisible by default (alpha=0) for release; enable during debug if needed
    this.frontLeftVis.alpha = 0;
    this.frontRightVis.alpha = 0;
    // this.frontLeftHorVis.alpha = 0; // disabled
    // this.frontRightHorVis.alpha = 0; // disabled
    // this.frontLeftHorVis2.alpha = 0; // disabled
    // this.frontRightHorVis2.alpha = 0; // disabled
    
    // --- ADD TO CONTAINER (IMPORTANT) ---
    // Draw order:
    // 1. Net (bottom)
    this.addChild(this.netSprite);
    // 2. Goal frame (below/above ball depending on layer logic)
    this.addChild(this.goalSprite);
    // 3. Hitboxes (invisible)
    this.addChild(this.leftPost);
    this.addChild(this.rightPost);
    this.addChild(this.crossbar);
    // Front visuals are intentionally added last so they appear above the net/goal visuals
    this.addChild(this.frontLeftVis);
    this.addChild(this.frontRightVis);
    // Add horizontal front guides (above slanted guides so they remain visible)
    // this.addChild(this.frontLeftHorVis); // disabled
    // this.addChild(this.frontRightHorVis); // disabled
    // Add second horizontal guides (slightly higher)
    // this.addChild(this.frontLeftHorVis2); // disabled
    // this.addChild(this.frontRightHorVis2); // disabled
    // 4. Debug Zone
    this.addChild(this.zoneVisualization);

    this._onResize = this.updateScale.bind(this);
    window.addEventListener('resize', this._onResize);

    // Init Scale
    // Init Scale
    if (this.goalSprite.texture && this.goalSprite.texture.width) {
      this.updateScale();
    } else {
      this.goalSprite.texture.on('update', () => this.updateScale());
    }
  }
  public getFrontLayer(): PIXI.Container {
    const frontLayer = new PIXI.Container();
    // Create lightweight visuals that mirror the frontLeftVis/frontRightVis so callers
    // that attach a separate front layer can still display guides.
    // Create lightweight visuals that mirror the frontLeftVis/frontRightVis so callers
    // that attach a separate front layer can still display guides.
    const left = new PIXI.Graphics();
    const right = new PIXI.Graphics();
    left.name = 'frontLeft';
    right.name = 'frontRight';
    left.alpha = 0.45;
    right.alpha = 0.45;
    frontLayer.addChild(left);
    frontLayer.addChild(right);
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

    // Update posts/crossbar hitbox
    this.updateGoalPostsHitbox(s);
    
    this.drawZoneVisualization();
    try { this.setupInteractionZones(); } catch (e) {}
  }

  // Redraw rectangular hitboxes to match goal art
  private updateGoalPostsHitbox(scale: number) {
    // Estimated post size in the art (may need tuning)
       const postThickness = 15 * scale; // post thickness
       const barHeight = 12 * scale;     // crossbar thickness
    
    const goalBounds = this.goalSprite.getLocalBounds(); // Get original (unscaled) bounds
       // With goalSprite anchor (0.5, 0), local coordinates are:
       // x from -width/2 to width/2
       // y from 0 to height
    
    const w = goalBounds.width * scale;
    const h = goalBounds.height * scale;
    
    const gx = this.goalSprite.x;
    const gy = this.goalSprite.y;

    // 1. Left Post Hitbox
    this.leftPost.clear();
    this.leftPost.beginFill(0xFF0000, 0.5); // Debug red fill
    // Left post position from center: x = gx - w/2
    this.leftPost.drawRect(1, 1, postThickness, h); 
    this.leftPost.endFill();
    this.leftPost.x = gx - w/2;
    this.leftPost.y = gy;

    // 2. Right Post Hitbox
    this.rightPost.clear();
    this.rightPost.beginFill(0xFF0000, 0.5);
    // Right post position: x = gx + w/2 - thickness
    this.rightPost.drawRect(1, 1, postThickness, h);
    this.rightPost.endFill();
    this.rightPost.x = gx + w/2 - postThickness;
    this.rightPost.y = gy;

    // 3. Crossbar Hitbox
      // 3. Crossbar Hitbox
    this.crossbar.clear();
    this.crossbar.beginFill(0xFF0000, 0.5);
    this.crossbar.drawRect(1, 1, w, barHeight);
    this.crossbar.endFill();
    this.crossbar.x = gx - w/2;
    this.crossbar.y = gy;

    // 4. Front visual guides (thin slanted rectangles in front of the net)
    try {
      const fw = Math.max(6, Math.round(postThickness * 0.6));
      const angleDeg = -12;
      const angle = (angleDeg * Math.PI) / 180;

      // LEFT slanted guide (leans toward center)
      if (this.frontLeftVis) {
        this.frontLeftVis.clear();
        this.frontLeftVis.beginFill(0xFF4444, 1);
        // draw rectangle with top at y=0; center horizontally on pivot
        this.frontLeftVis.drawRect(-fw / 2, 0, fw, h*0.82);
        this.frontLeftVis.endFill();
        this.frontLeftVis.pivot.set(0, 0);
        // place just inside the left post inner edge
        const leftInnerX = gx - w / 2 + postThickness; // inner edge
        this.frontLeftVis.x = 1.3*leftInnerX + Math.round(fw * 0.2);
        this.frontLeftVis.y = gy;
        this.frontLeftVis.rotation = angle; // lean inward
      }

      // RIGHT slanted guide (leans toward center)
      if (this.frontRightVis) {
        this.frontRightVis.clear();
        this.frontRightVis.beginFill(0xFF4444, 1);
        this.frontRightVis.drawRect(-fw / 2, 0, fw, h*0.82);
        this.frontRightVis.endFill();
        this.frontRightVis.pivot.set(0, 0);
        const rightInnerX = gx + w / 2 - postThickness; // inner edge
        this.frontRightVis.x = 0.96*rightInnerX - Math.round(fw * 0.2);
        this.frontRightVis.y = gy;
        this.frontRightVis.rotation = -angle; // lean inward toward center
      }
      // Horizontal guides (thin horizontal bars placed slightly below mid-height)
      try {
        const hhW = Math.max(24, Math.round(w * 0.18));
        const hhH = Math.max(4, Math.round(postThickness * 0.4));
        const hhY = gy + Math.round(h * 0.5);

        if (this.frontLeftHorVis) {
          this.frontLeftHorVis.clear();
          this.frontLeftHorVis.beginFill(0xFF6666, 1);
          this.frontLeftHorVis.drawRect(0, 0, hhW*0.6, hhH*3);
          this.frontLeftHorVis.endFill();
          // center pivot for clean rotation
          this.frontLeftHorVis.pivot.set(Math.round(hhW / 2), Math.round(hhH / 2));
          // place slightly inside the left inner edge (compute center X)
          const leftInnerX = gx - w / 2 + postThickness;
          const centerX = Math.round(leftInnerX + 6 + hhW / 2);
          // Align Y to the lower (greater Y) between the slanted vis bottom and the post bottom
          try {
            const visB = this.frontLeftVis.getBounds(); // global bounds
            const postB = this.leftPost.getBounds(); // global bounds
            const visBottomGlobal = visB.y + visB.height;
            const postBottomGlobal = postB.y + postB.height;
            const targetGlobalY = Math.max(visBottomGlobal, postBottomGlobal);
            const localPt = this.toLocal(new PIXI.Point(visB.x, targetGlobalY));
            const centerY = Math.round(localPt.y);
            this.frontLeftHorVis.x = centerX*0.9;
            this.frontLeftHorVis.y = centerY*0.8;
          } catch (e) {
            this.frontLeftHorVis.x = centerX;
            this.frontLeftHorVis.y = hhY;
          }
          // rotate 45deg around Z (lean inward)
          this.frontLeftHorVis.rotation = -Math.PI / 4;
        }

        if (this.frontRightHorVis) {
          this.frontRightHorVis.clear();
          this.frontRightHorVis.beginFill(0xFF6666, 1);
          this.frontRightHorVis.drawRect(0, 0, hhW*0.6, hhH*3);
          this.frontRightHorVis.endFill();
          // center pivot for clean rotation
          this.frontRightHorVis.pivot.set(Math.round(hhW / 2), Math.round(hhH / 2));
          const rightInnerX = gx + w / 2 - postThickness;
          // position so the bar's right edge sits a bit inside the inner edge -> compute center X
          const centerX = Math.round(rightInnerX - hhW / 2 - 6);
          // Align Y to the lower (greater Y) between the slanted vis bottom and the post bottom
          try {
            const visB = this.frontRightVis.getBounds();
            const postB = this.rightPost.getBounds();
            const visBottomGlobal = visB.y + visB.height;
            const postBottomGlobal = postB.y + postB.height;
            const targetGlobalY = Math.max(visBottomGlobal, postBottomGlobal);
            const localPt = this.toLocal(new PIXI.Point(visB.x, targetGlobalY));
            const centerY = Math.round(localPt.y);
            this.frontRightHorVis.x = centerX*1.06;
            this.frontRightHorVis.y = centerY*0.9;
          } catch (e) {
            this.frontRightHorVis.x = centerX;
            this.frontRightHorVis.y = hhY;
          }
          // rotate -45deg around Z (lean inward)
          this.frontRightHorVis.rotation = Math.PI / 4;
        }
        // --- second pair (higher Y by factor 1.1) ---
        try {
          if (this.frontLeftHorVis2) {
            this.frontLeftHorVis2.clear();
            this.frontLeftHorVis2.beginFill(0xFF6666, 1);
            this.frontLeftHorVis2.drawRect(0, 0, hhW*0.5, hhH*3);
            this.frontLeftHorVis2.endFill();
            this.frontLeftHorVis2.pivot.set(Math.round(hhW / 2), Math.round(hhH / 2));
            const leftInnerX2 = gx - w / 2 + postThickness;
            const centerX2 = Math.round(leftInnerX2 + 6 + hhW / 2);
            try {
              const visB = this.frontLeftVis.getBounds();
              const postB = this.leftPost.getBounds();
              const visBottomGlobal = visB.y + visB.height;
              const postBottomGlobal = postB.y + postB.height;
              const targetGlobalY = Math.max(visBottomGlobal, postBottomGlobal);
              const localPt = this.toLocal(new PIXI.Point(visB.x, targetGlobalY));
              const centerY = Math.round(localPt.y * 0.65);
              this.frontLeftHorVis2.x = centerX2 * 0.93;
              this.frontLeftHorVis2.y = centerY;
            } catch (e) {
              this.frontLeftHorVis2.x = centerX2;
              this.frontLeftHorVis2.y = Math.round(hhY * 1.1);
            }
            this.frontLeftHorVis2.rotation = -Math.PI / 4;
          }

          if (this.frontRightHorVis2) {
            this.frontRightHorVis2.clear();
            this.frontRightHorVis2.beginFill(0xFF6666, 1);
            this.frontRightHorVis2.drawRect(0, 0, hhW*0.5, hhH*3);
            this.frontRightHorVis2.endFill();
            this.frontRightHorVis2.pivot.set(Math.round(hhW / 2), Math.round(hhH / 2));
            const rightInnerX2 = gx + w / 2 - postThickness;
            const centerX2 = Math.round(rightInnerX2 - hhW / 2 - 6);
            try {
              const visB = this.frontRightVis.getBounds();
              const postB = this.rightPost.getBounds();
              const visBottomGlobal = visB.y + visB.height;
              const postBottomGlobal = postB.y + postB.height;
              const targetGlobalY = Math.max(visBottomGlobal, postBottomGlobal);
              const localPt = this.toLocal(new PIXI.Point(visB.x, targetGlobalY));
              const centerY = Math.round(localPt.y * 0.75);
              this.frontRightHorVis2.x = centerX2 * 1.06;
              this.frontRightHorVis2.y = centerY;
            } catch (e) {
              this.frontRightHorVis2.x = centerX2;
              this.frontRightHorVis2.y = Math.round(hhY * 1.1);
            }
            this.frontRightHorVis2.rotation = Math.PI / 4;
          }
        } catch (e) {}
      } catch (e) {}
    } catch (e) {}
  }
  
  // Get goal area for scoring (inside the goal)
    // Get goal area for scoring (inside the goal)
  public getGoalArea() {
    // Use the hitbox set up above to compute the goal area
      const lx = this.leftPost.x + this.leftPost.width; // Inner edge of the left post
      const rx = this.rightPost.x; // Inner edge of the right post
      const by = this.crossbar.y + this.crossbar.height; // Bottom edge of the crossbar
    const bottom = this.leftPost.y + this.leftPost.height;

    // Coordinates are local to Goal container (hitboxes are direct children).
    // getGoalArea returns local coords relative to the Goal container.
    
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

      // Example: create green zones outside the posts
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
