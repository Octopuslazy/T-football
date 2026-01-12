import * as PIXI from 'pixi.js';

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
    const tex = PIXI.Texture.from('/Assets/arts/goal.png');
    this.goalSprite = new PIXI.Sprite(tex);
    this.goalSprite.anchor.set(0.5, 0); // mid-top
    
    // Create net sprite (background layer)
    const netTex = PIXI.Texture.from('/Assets/arts/net.png');
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
    
    const targetWidth = (window.innerWidth / 2) * 1.4; // Full half-screen width
    const s = targetWidth / this.goalSprite.texture.width;
    this.goalSprite.scale.set(s, s);    
    // Scale and position net to match goal
    if (this.netSprite.texture && this.netSprite.texture.width) {
      this.netSprite.scale.set(s, s);
      this.netSprite.x = window.innerWidth / 2;
      this.netSprite.y = window.innerHeight*1/6;
    }
    // Center horizontally, place near top of screen but visible
    this.goalSprite.x = window.innerWidth / 2;
    this.goalSprite.y = window.innerHeight*1/6;
    
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
    const postColor = 0xFF0000; // red color
    const postWidth = 40 * scale;
    const postHeight = 520 * scale;
    const crossbarHeight = 40 * scale;
    
    // Get goal sprite bounds after scaling
    const goalBounds = this.goalSprite.getBounds();
    
    // Clear and redraw left post (anchor: top-left)
    this.leftPost.clear();
    this.leftPost.fill(postColor);
    this.leftPost.rect(0, 0, postWidth, postHeight);
    this.leftPost.fill();
    this.leftPost.pivot.set(0, 0); // anchor top-left
    this.leftPost.x = goalBounds.left;
    this.leftPost.y = goalBounds.top;
    
    // Clear and redraw right post (anchor: top-right)
    this.rightPost.clear();
    this.rightPost.fill(postColor);
    this.rightPost.rect(0, 0, postWidth, postHeight);
    this.rightPost.fill();
    this.rightPost.pivot.set(postWidth, 0); // anchor top-right
    this.rightPost.x = goalBounds.right;
    this.rightPost.y = goalBounds.top;
    
    // Clear and redraw crossbar (anchor: mid-top)
    this.crossbar.clear();
    this.crossbar.fill(postColor);
    this.crossbar.rect(0, 0, goalBounds.width, crossbarHeight);
    this.crossbar.fill();
    this.crossbar.pivot.set(goalBounds.width / 2, 0); // anchor mid-top
    this.crossbar.x = goalBounds.left + goalBounds.width / 2;
    this.crossbar.y = goalBounds.top;
  }
  
  // Get goal area for scoring (inside the goal)
  public getGoalArea() {
    return {
      x: this.leftPost.x + this.leftPost.width,
      y: this.leftPost.y + this.crossbar.height,
      width: this.rightPost.x - (this.leftPost.x + this.leftPost.width),
      height: this.leftPost.height - this.crossbar.height
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

  // Draw visual representation of the 12 zones
  private drawZoneVisualization() {
    if (!this.showZones) return;
    
    this.zoneVisualization.clear();
    
    const zones = this.getGoalZones();
    const goalArea = this.getGoalArea();
    
    // Calculate circle diameter as 1/4 of goal area height
    const circleRadius = (goalArea.height / 4) / 2;
    
    // Draw scoring grid (optional) using light outlines and center markers
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const localX = zone.x; // zones are already world coords relative to stage
      const localY = zone.y;
      this.zoneVisualization.lineStyle(2, 0x880000, 0.5);
      this.zoneVisualization.rect(localX, localY, zone.width, zone.height);
      // center marker
      const centerX = zone.x + zone.width / 2;
      const centerY = zone.y + zone.height / 2;
      this.zoneVisualization.fill(0xFF0000, 0.25);
      this.zoneVisualization.circle(centerX, centerY, circleRadius);
      this.zoneVisualization.fill();
    }

    // Also draw the interaction rectangles (green / red / yellow) explicitly so they match
    // the setupInteractionZones definitions. Draw them at absolute positions (goalArea-based)
    try {
      const gx = goalArea.x;
      const gy = goalArea.y;
      const gw = goalArea.width;
      const gh = goalArea.height;


      // Yellow (inside near posts)
      const yellowH = Math.max(8, gh * 0.12);
      const yellowWSide = Math.max(3, gw * 0.1);
      const yellowWSideSmall = Math.max(10, Math.round(yellowWSide * 0.5));
      const yellowShiftX = -5;
      const yellowLeft = { x: gx + Math.max(1, gw * 0.03)-30 + yellowShiftX, y: gy + Math.max(6, gh * 0.03), w: yellowWSideSmall, h: yellowH+300 };
      const yellowRight = { x: gx + gw - yellowWSideSmall - Math.max(6, gw * 0.03) + yellowShiftX, y: gy + Math.max(6, gh * 0.03), w: yellowWSideSmall, h: yellowH+300 };
      // Yellow crossbar: draw a thin yellow rect just inside the red crossbar
      const yellowCrossbar = { x: gx + 2, y: gy, w: Math.max(0, gw - 4), h: yellowH -28};
      this.zoneVisualization.fill(0xFFFF00, 0.35);
      this.zoneVisualization.rect(yellowLeft.x, yellowLeft.y, yellowLeft.w, yellowLeft.h);
      this.zoneVisualization.rect(yellowRight.x, yellowRight.y, yellowRight.w, yellowRight.h);
      // Draw the yellow crossbar inset slightly so it's visibly inside the red crossbar
      this.zoneVisualization.rect(yellowCrossbar.x, yellowCrossbar.y, yellowCrossbar.w, yellowCrossbar.h);
      this.zoneVisualization.fill();
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
