import { Spine } from '@pixi/spine-pixi';
import { Assets } from 'pixi.js';
export class SpinePlayer {
    constructor(name = 'goalkeeper') {
        this.name = name;
        this.spine = null;
    }
    /**
     * Load Spine animation từ .skel file (Spine 4.3)
     * @param skelPath - Path to .skel file
     */
    async load(skelPath) {
        try {
            // Load spine data using Pixi Assets
            const resource = await Assets.load(skelPath);
            if (!resource || !resource.spineData) {
                return null;
            }
            // Create Spine instance
            this.spine = new Spine(resource.spineData);
            // Setup visibility
            this.spine.visible = true;
            this.spine.alpha = 1;
            // Setup skeleton
            if (this.spine.skeleton) {
                // Set default skin
                if (this.spine.skeleton.data.defaultSkin) {
                    this.spine.skeleton.setSkin(this.spine.skeleton.data.defaultSkin);
                }
                // Setup pose
                this.spine.skeleton.setToSetupPose();
                // Force skeleton color
                if (this.spine.skeleton.color) {
                    this.spine.skeleton.color.a = 1.0;
                    this.spine.skeleton.color.r = 1.0;
                    this.spine.skeleton.color.g = 1.0;
                    this.spine.skeleton.color.b = 1.0;
                }
            }
            // Auto update
            this.spine.autoUpdate = true;
            // Initial update
            this.spine.update(0.016);
            return this;
        }
        catch (err) {
            return null;
        }
    }
    /**
     * Play animation
     */
    playAnimation(animationName, loop = true) {
        if (!this.spine || !this.spine.state) {
            return;
        }
        try {
            this.spine.state.setAnimation(0, animationName, loop);
        }
        catch (e) {
            // Animation failed
        }
    }
    /**
     * Get available animations
     */
    getAnimations() {
        if (!this.spine?.skeleton?.data?.animations)
            return [];
        return this.spine.skeleton.data.animations.map((a) => a.name);
    }
    destroy() {
        if (this.spine) {
            this.spine.destroy();
            this.spine = null;
        }
    }
}
