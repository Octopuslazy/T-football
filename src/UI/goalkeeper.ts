import { Container } from 'pixi.js';
import { Spine } from '@pixi/spine-pixi';

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

    /**
     * ⚠️ spineAsset PHẢI là Spine instance do Pixi Assets loader tạo
     */
    public init(spineAsset: Spine) {
        if (!spineAsset) {
            console.error('❌ Goalkeeper.init: spineAsset is null');
            return;
        }

        // 🔥 BẮT BUỘC clone trong Pixi v8
        this.spine = spineAsset.clone();

        // Animation idle
        const idleAnim =
            this.spine.spineData.findAnimation('idle') ||
            this.spine.spineData.animations[0];

        if (idleAnim) {
            this.spine.state.setAnimation(0, idleAnim.name, true);
        }

        this.addChild(this.spine);

        this.updateScale();
        this.reset();

        console.log('✅ Goalkeeper Spine initialized (Pixi v8)');
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

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        let scale =
            Math.min(screenW / 1920, screenH / 1080) * 0.6;

        // Clamp theo chiều cao gôn
        if (this._goal?.getGoalArea) {
            const goalArea = this._goal.getGoalArea();
            if (goalArea?.height > 0) {
                const maxScale = (goalArea.height * 0.65) / this.spine.height;
                scale = Math.min(scale, maxScale);

                const cx = goalArea.x + goalArea.width / 2;
                const by = goalArea.y + goalArea.height - 20;
                this.setInitialPosition(cx, by);
            }
        }

        this.scale.set(Math.max(0.05, scale));
    }

    destroy(options?: any) {
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
}
