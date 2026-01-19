import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';


export default class Goal extends PIXI.Container {
  private goalSprite: PIXI.Sprite;
  private netSprite: PIXI.Sprite;
  private leftPost: PIXI.Graphics;
  private rightPost: PIXI.Graphics;
  private crossbar: PIXI.Graphics;
  private zoneVisualization: PIXI.Graphics;
  private _onResize: () => void;
  private showZones: boolean = true; // Toggle zone visualization

  constructor() {
    super();
    
    // Create goal sprite (frame)
    const tex = PIXI.Texture.from('./arts/goal.png');
    this.goalSprite = new PIXI.Sprite(tex);
    this.goalSprite.anchor.set(0.5, 0); // mid-top
    
    // Create net sprite (background layer)
    const netTex = PIXI.Texture.from('./arts/net.png');
    this.netSprite = new PIXI.Sprite(netTex);
    this.netSprite.anchor.set(0.5, 0); // mid-top
    
    // Create goal posts
    this.leftPost = new PIXI.Graphics();
    this.rightPost = new PIXI.Graphics();
    this.crossbar = new PIXI.Graphics();
    
    // Create zone visualization
    this.zoneVisualization = new PIXI.Graphics();
    
    // Add children in correct layer order:
    // 1. Net (back layer - behind ball)
    this.addChild(this.netSprite);
    // 2. Zone visualization
    this.addChild(this.zoneVisualization);
    // Note: Ball will be added by app between net and goal frame
    // 3. Goal frame and posts will be added later to be in front of ball

    this._onResize = this.updateScale.bind(this);
    window.addEventListener('resize', this._onResize);

    // Initial placement/scale
    if (this.goalSprite.texture && this.goalSprite.texture.width) {
      this.updateScale();
    } else {
      // If texture isn't loaded yet, wait for it
      this.goalSprite.texture.on('update', () => this.updateScale());
    }
  }
  
    // Interaction zones (green/red/yellow) used by Ball for collisions
    // `gfx` is optional — visuals are drawn into `zoneVisualization` to avoid duplicate Graphics children.
    private _interactionZones: Array<{ type: 'green'|'yellow'; rectLocal: { x:number;y:number;w:number;h:number }; gfx?: PIXI.Graphics | null }>=[];
  
  // Get front layer container (to be added to app after ball)
  public getFrontLayer(): PIXI.Container {
    const frontLayer = new PIXI.Container();
    frontLayer.addChild(this.goalSprite);
    frontLayer.addChild(this.leftPost);
    frontLayer.addChild(this.rightPost);
    frontLayer.addChild(this.crossbar);
    return frontLayer;
  }

  updateScale() {
    if (!this.goalSprite.texture || !this.goalSprite.texture.width) return;

    // Use base design resolution so goal aligns with world container coordinates
    const targetWidth = (BASE_WIDTH / 2) * 1.55; // Full half-base width
    const s = targetWidth / this.goalSprite.texture.width;
    this.goalSprite.scale.set(s, s);
    // Scale and position net to match goal (base coords)
    if (this.netSprite.texture && this.netSprite.texture.width) {
      this.netSprite.scale.set(s, s);
      this.netSprite.x = Math.round(BASE_WIDTH / 2);
      this.netSprite.y = Math.round(BASE_HEIGHT * 1 / 6);
    }
    // Center horizontally, place near top of screen (base coords)
    this.goalSprite.x = Math.round(BASE_WIDTH / 2);
    this.goalSprite.y = Math.round(BASE_HEIGHT * 1 / 6);
    
    // Update goal posts to match scaled goal
    this.updateGoalPosts(s);
    
    // Draw zone visualization
    this.drawZoneVisualization();

    // Ensure interaction zones (green/red/yellow) are created and attached
    // These are used by `Ball.getInteractionZoneAt()` to detect collisions.
    try { this.setupInteractionZones(); } catch (e) { /* silent */ }
  }
  
    // Prepare interaction zones (used for collision behavior). Visuals are drawn centrally
    // in `drawZoneVisualization()` to avoid creating multiple Graphics children.
    private setupInteractionZones() {
      // clear existing
      try {
        // If any gfx were accidentally created previously, remove them safely
        for (const z of this._interactionZones) {
          try { if (z.gfx && z.gfx.parent) z.gfx.parent.removeChild(z.gfx); if (z.gfx) z.gfx.destroy(); } catch(e) {}
        }
        this._interactionZones = [];
      } catch(e) {}

      const goalArea = this.getGoalArea();
      const gx = goalArea.x;
      const gy = goalArea.y;
      const gw = goalArea.width;
      const gh = goalArea.height;

      // Red (front mouth) - local coords relative to goalArea
     
      // Green (outside posts)
      const greenW = Math.max(24, Math.min(60, gw * 0.08));
      const gLeft = { x: -greenW - 6, y: 0, w: greenW, h: gh };
      const gRight = { x: gw + 6, y: 0, w: greenW, h: gh };
      // Yellow (two small rectangles near top inside goal)

      // Only store rectLocal data; visuals are handled in drawZoneVisualization()
      this._interactionZones.push({ type:'green', rectLocal: gLeft, gfx: null });
      this._interactionZones.push({ type:'green', rectLocal: gRight, gfx: null });
      
     

    }
  
    // Return interaction zone (type and world rect) at world coords x,y or null
    public getInteractionZoneAt(worldX:number, worldY:number) : { type: 'green'|'yellow'; rectWorld: {x:number;y:number;w:number;h:number} } | null {
      const goalArea = this.getGoalArea();
      for (const z of this._interactionZones) {
        const rLocal = z.rectLocal;
        const world = { x: goalArea.x + rLocal.x, y: goalArea.y + rLocal.y, w: rLocal.w, h: rLocal.h };
        if (worldX >= world.x && worldX <= world.x + world.w && worldY >= world.y && worldY <= world.y + world.h) {
          return { type: z.type, rectWorld: world };
        }
      }
      return null;
    }
  
  private updateGoalPosts(scale: number) {
    const postColor = 0xFFFFFF; // white color (was red)
    const postWidth = 40 * scale;
    const postHeight = 520 * scale;
    const crossbarHeight = 30 * scale;
    
    // Get goal sprite bounds after scaling
    const goalBounds = this.goalSprite.getBounds();
    
    // Clear and redraw left post (anchor: top-left)
    this.leftPost.clear();
    this.leftPost.fill(postColor, 1); // Alpha = 0 to make transparent
    this.leftPost.rect(0, 0, postWidth, postHeight);
    this.leftPost.fill();
    this.leftPost.pivot.set(0, 0); // anchor top-left
    this.leftPost.x = goalBounds.left;
    this.leftPost.y = goalBounds.top;
    
    // Clear and redraw right post (anchor: top-right)
    this.rightPost.clear();
    this.rightPost.fill(postColor, 1); // Alpha = 0 to make transparent
    this.rightPost.rect(0, 0, postWidth, postHeight);
    this.rightPost.fill();
    this.rightPost.pivot.set(postWidth, 0); // anchor top-right
    this.rightPost.x = goalBounds.right;
    this.rightPost.y = goalBounds.top;
    
    // Clear and redraw crossbar (anchor: mid-top)
    this.crossbar.clear();
    this.crossbar.fill(postColor, 1); // Alpha = 0 to make transparent
    this.crossbar.rect(0, 0, goalBounds.width, crossbarHeight);
    this.crossbar.fill();
    this.crossbar.pivot.set(goalBounds.width / 2, 0); // anchor mid-top
    this.crossbar.x = goalBounds.left + goalBounds.width / 2;
    this.crossbar.y = goalBounds.top-20;
  }
  
  // Get goal area for scoring (inside the goal)
  public getGoalArea() {
    try {
      // getBounds() returns world/global coordinates; convert them to this
      // container's local coordinates so callers (Ball, Goalkeeper) receive
      // coordinates in the same space as other world objects (container-local).
      const leftBounds = this.leftPost.getBounds();
      const rightBounds = this.rightPost.getBounds();
      const crossbarBounds = this.crossbar.getBounds();

      const worldLeftInnerX = leftBounds.x + leftBounds.width;
      const worldTopInnerY = crossbarBounds.y + crossbarBounds.height;
      const worldRightInnerX = rightBounds.x;
      const worldBottomInnerY = leftBounds.y + leftBounds.height;

      const topLeftLocal = this.toLocal(new PIXI.Point(worldLeftInnerX, worldTopInnerY));
      const bottomRightLocal = this.toLocal(new PIXI.Point(worldRightInnerX, worldBottomInnerY));

      const x = topLeftLocal.x;
      const y = topLeftLocal.y;
      const width = Math.max(0, bottomRightLocal.x - topLeftLocal.x);
      const height = Math.max(0, bottomRightLocal.y - topLeftLocal.y);

      return { x, y, width, height };
    } catch (e) {
      // Fallback to conservative estimate based on sprite positioning (already local)
      return {
        x: this.leftPost.x + (this.leftPost.width || 0),
        y: this.leftPost.y + (this.crossbar.height || 0),
        width: (this.rightPost.x || 0) - (this.leftPost.x + (this.leftPost.width || 0)),
        height: (this.leftPost.height || 0) - (this.crossbar.height || 0)
      };
    }
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

      // Convert world corner points into local coordinates
      const tl = this.toLocal(new PIXI.Point(zone.x, zone.y));
      const tr = this.toLocal(new PIXI.Point(zone.x + zone.width, zone.y));
      const bl = this.toLocal(new PIXI.Point(zone.x, zone.y + zone.height));

      const localX = tl.x;
      const localY = tl.y;
      const localW = tr.x - tl.x;
      const localH = bl.y - tl.y;

      this.zoneVisualization.lineStyle(2, 0x880000, 0.5);
      this.zoneVisualization.rect(localX, localY, localW, localH);

      // center marker (red circle) — make visible with modest alpha
      const centerLocalX = localX + localW / 2;
      const centerLocalY = localY + localH / 2;
      const circleRadiusLocal = (localH / 4) / 2;
      this.zoneVisualization.beginFill(0xFF0000, 0.22);
      this.zoneVisualization.drawCircle(centerLocalX, centerLocalY, Math.max(4, circleRadiusLocal));
      this.zoneVisualization.endFill();
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

  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}
