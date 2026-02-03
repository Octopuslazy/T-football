import { Spine } from '@pixi/spine-pixi';
import { Assets } from 'pixi.js';

export class SpinePlayer {
    name: string;
    spine: Spine | null;

    constructor(name = 'goalkeeper') {
        this.name = name;
        this.spine = null;
    }

    /**
     * Load Spine animation từ .skel file (Spine 4.3)
     * @param skelPath - Path to .skel file
     */
    async load(skelPath: string): Promise<SpinePlayer | null> {
        try {
            console.log(`[SPINE] Loading ${skelPath}...`);
            
            // Load spine data using Pixi Assets
            const resource = await Assets.load(skelPath);
            
            if (!resource || !resource.spineData) {
                console.error('[SPINE] Failed to load spine data');
                return null;
            }

            // Create Spine instance
            this.spine = new Spine(resource.spineData);
            
            console.log('[SPINE] Spine created:', {
                hasSpine: !!this.spine,
                hasSkeleton: !!this.spine.skeleton,
                animations: this.spine.skeleton?.data?.animations?.length || 0,
                animationNames: this.spine.skeleton?.data?.animations?.map((a: any) => a.name) || []
            });

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

            console.log('[SPINE] ✅ Spine loaded successfully');
            return this;
        } catch (err) {
            console.error('[SPINE] Load failed:', err);
            return null;
        }
    }

    /**
     * Play animation
     */
    playAnimation(animationName: string, loop = true) {
        if (!this.spine || !this.spine.state) {
            console.warn('[SPINE] Cannot play animation - spine not initialized');
            return;
        }

        try {
            this.spine.state.setAnimation(0, animationName, loop);
            console.log(`[SPINE] Playing animation: ${animationName} (loop: ${loop})`);
        } catch (e) {
            console.error(`[SPINE] Failed to play animation ${animationName}:`, e);
        }
    }

    /**
     * Get available animations
     */
    getAnimations(): string[] {
        if (!this.spine?.skeleton?.data?.animations) return [];
        return this.spine.skeleton.data.animations.map((a: any) => a.name);
    }

    destroy() {
        if (this.spine) {
            this.spine.destroy();
            this.spine = null;
        }
    }
}
