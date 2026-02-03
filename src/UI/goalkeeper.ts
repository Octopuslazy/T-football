import { Container } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

export default class Goalkeeper extends Container {
    private spine!: Spine;
    private _goal: any = null;
    private _onResize: () => void;
    private _initialPosition = { x: 0, y: 0 };

    constructor() {
        super();
        this._onResize = this.updateScale.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    public init(spineAsset: Spine) {
        if (!spineAsset) {
            console.error('❌ Goalkeeper.init: spineAsset is null');
            return;
        }

        console.log('Removing old children, count:', this.children.length);
        this.removeChildren();
        
        this.spine = spineAsset;

        console.log('🔍 Spine structure:', {
            hasState: !!this.spine.state,
            hasSkeleton: !!this.spine.skeleton,
            skeletonData: !!this.spine.skeleton?.data,
            animations: this.spine.skeleton?.data?.animations?.map((a: any) => a.name)
        });

        // Force visibility
        this.spine.visible = true;
        this.spine.alpha = 1;
        
        // Force update
        if (this.spine.update) {
            this.spine.update(0.016);
        }

        // Play idle animation
        try {
            const animations = this.spine.skeleton?.data?.animations || [];
            
            if (animations.length > 0) {
                const idleAnim = animations.find((a: any) => a.name === 'idle') || animations[0];
                if (idleAnim && this.spine.state) {
                    this.spine.state.setAnimation(0, idleAnim.name, true);
                    console.log('✅ Playing animation:', idleAnim.name);
                }
            }
        } catch (e) {
            console.warn('⚠️ Failed to set animation:', e);
        }

        // Add spine at center of container
        this.spine.x = 0;
        this.spine.y = 0;
        this.addChild(this.spine);

        this.updateScale();
        this.reset();

        console.log('✅ Goalkeeper Spine initialized, children count:', this.children.length);
    }

    public reset() {
        if (!this.spine) return;

        this.x = this._initialPosition.x;
        this.y = this._initialPosition.y;

        this.rotation = 0;
        this.spine.rotation = 0;

        try {
            this.spine.state.setAnimation(0, 'idle', true);
        } catch {}
    }

    public setGoal(goal: any) {
        this._goal = goal;
        this.updateScale();
    }

    private setInitialPosition(x: number, y: number) {
        this._initialPosition = { x, y };
        this.x = x;
        this.y = y;
    }

    private updateScale() {
        if (!this.spine) return;

        // Lấy thông tin goal
        if (!this._goal || !this._goal.goalSprite) return;
        
        const goal = this._goal.goalSprite;
        const goalWidth = goal.width;
        const goalHeight = goal.height;
        const goalX = goal.x;
        const goalY = goal.y;
        
        console.log('🥅 Goal info:', {
            x: goalX,
            y: goalY,
            width: goalWidth,
            height: goalHeight
        });
        
        // Scale goalkeeper = 2/3 chiều cao goal
        const targetHeight = goalHeight * (2 / 3);
        
        // Lấy bounds của spine để tính scale
        const spineBounds = this.spine.getLocalBounds();
        if (spineBounds && spineBounds.height > 0) {
            const scale = targetHeight / spineBounds.height;
            this.spine.scale.set(scale, scale);
            
            console.log('⚽ Goalkeeper scale:', scale, 'target height:', targetHeight, 'spine height:', spineBounds.height);
        }
        
        // Đặt goalkeeper tại giữa goal (center X, bottom Y)
        const centerX = goalX;
        const bottomY = goalY + goalHeight - 30; // Trừ 30px để goalkeeper đứng trên sân
        
        this.setInitialPosition(centerX, bottomY);
        
        console.log('📍 Goalkeeper position:', centerX, bottomY);
    }

    destroy(options?: any) {
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
}
