import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';
export default class Goal extends PIXI.Container {
    constructor() {
        super();
        // 1. Goal Sprite (visual frame)
        const tex = PIXI.Texture.from('/Assets/arts/Goal_1_a.png');
        this.goalSprite = new PIXI.Sprite(tex);
        this.goalSprite.anchor.set(0.5, 0);
        // Hide visual goal sprite (keep net visible)
        this.goalSprite.alpha = 1;
        // 2. Net Sprite (net)
        const netTex = PIXI.Texture.from('/Assets/arts/Goal_1_b.png');
        this.netSprite = new PIXI.Sprite(netTex);
        this.netSprite.anchor.set(0.5, 0);
        this.netSprite.alpha = 1; // Show net normally (sits behind the ball)
        // 3. Create HITBOX for posts/crossbar (Important: add to Goal)
        this.leftPost = new PIXI.Graphics();
        this.rightPost = new PIXI.Graphics();
        this.crossbar = new PIXI.Graphics();
        this.leftPost.alpha = 0;
        this.rightPost.alpha = 0;
        this.crossbar.alpha = 0;
        this.zoneVisualization = new PIXI.Graphics();
        this.addChild(this.netSprite);
        // 2. Goal frame (below/above ball depending on layer logic)
        this.addChild(this.goalSprite);
        // 3. Hitboxes (invisible)
        this.addChild(this.leftPost);
        this.addChild(this.rightPost);
        this.addChild(this.crossbar);
        this.addChild(this.zoneVisualization);
        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);
        // Init Scale
        // Init Scale
        if (this.goalSprite.texture && this.goalSprite.texture.width) {
            this.updateScale();
        }
        else {
            this.goalSprite.texture.on('update', () => this.updateScale());
        }
    }
    getFrontLayer() {
        const frontLayer = new PIXI.Container();
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
        if (!this.goalSprite.texture || !this.goalSprite.texture.width)
            return;
        // Scale logic
        const targetWidth = (BASE_WIDTH / 2) * 1.6;
        const s = targetWidth / this.goalSprite.texture.width;
        this.goalSprite.scale.set(s, s);
        this.goalSprite.x = Math.round(BASE_WIDTH / 2);
        this.goalSprite.y = Math.round(BASE_HEIGHT * 1 / 6.5);
        if (this.netSprite.texture) {
            this.netSprite.scale.set(s, s);
            this.netSprite.x = this.goalSprite.x;
            this.netSprite.y = this.goalSprite.y;
        }
        // Update posts/crossbar hitbox
        this.updateGoalPostsHitbox(s);
    }
    // Redraw rectangular hitboxes to match goal art
    updateGoalPostsHitbox(scale) {
        // Estimated post size in the art (may need tuning)
        const postThickness = 20 * scale; // post thickness
        const barHeight = 12 * scale; // crossbar thickness
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
        this.leftPost.beginFill(0xFF0000, 1); // Debug red fill
        // Left post position from center: x = gx - w/2
        this.leftPost.drawRect(1, 1, postThickness, h);
        this.leftPost.endFill();
        this.leftPost.x = gx - w / 2;
        this.leftPost.y = gy;
        // 2. Right Post Hitbox
        this.rightPost.clear();
        this.rightPost.beginFill(0xFF0000, 1);
        // Right post position: x = gx + w/2 - thickness
        this.rightPost.drawRect(1, 1, postThickness, h);
        this.rightPost.endFill();
        this.rightPost.x = gx + w / 2 - postThickness;
        this.rightPost.y = gy;
        // 3. Crossbar Hitbox
        // 3. Crossbar Hitbox
        this.crossbar.clear();
        this.crossbar.beginFill(0xFF0000, 1);
        this.crossbar.drawRect(1, 1, w, barHeight);
        this.crossbar.endFill();
        this.crossbar.x = gx - w / 2;
        this.crossbar.y = gy;
        try {
            // Debug: visualize net rectangle for easier collision tuning
            this.zoneVisualization.clear();
            this.zoneVisualization.lineStyle(3, 0x00ff00, 0.9);
            if (this.netSprite.texture) {
                // Use actual displayed size (width/height) which already include scale
                const netW = this.netSprite.width;
                const netH = this.netSprite.height;
                const netX = this.netSprite.x - netW / 2;
                const netY = this.netSprite.y;
                // Draw a filled, semi-transparent rectangle and reparent to the Goal's parent
                this.zoneVisualization.clear();
                this.zoneVisualization.beginFill(0x00ff00, 0.28);
                this.zoneVisualization.lineStyle(3, 0x00ff00, 0.9);
                this.zoneVisualization.drawRect(0, 0, netW, netH);
                this.zoneVisualization.endFill();
                this.zoneVisualization.alpha = 0;
                this.zoneVisualization.visible = true;
                try {
                    // compute position in parent's coordinate space so the rect sits at the same place
                    const topLeftGlobal = this.toGlobal(new PIXI.Point(netX, netY));
                    if (this.parent) {
                        const parentLocal = this.parent.toLocal(topLeftGlobal);
                        // move the visualization to parent so it renders above most siblings
                        this.parent.addChild(this.zoneVisualization);
                        this.zoneVisualization.position.set(parentLocal.x, parentLocal.y);
                    }
                    else {
                        // fallback: keep inside goal
                        this.zoneVisualization.position.set(netX, netY);
                    }
                }
                catch (e) {
                    // fallback to local coords
                    this.zoneVisualization.position.set(netX, netY);
                }
            }
        }
        catch (e) { }
    }
}
