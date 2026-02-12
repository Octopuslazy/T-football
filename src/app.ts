import { Application, Container, Ticker, Assets, Graphics, Text, TextStyle, Texture, Sprite } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BallGame } from './UI/ball';
import Goal from './UI/goal';
import Ground from './UI/ground';
import ScoreDisplay from './UI/scoreDisplay';
import StartScreen from './UI/startScreen';
import BallCountDisplay from './UI/ballCountDisplay';
import { BASE_WIDTH, BASE_HEIGHT } from './constant/global';
import { BallCollision } from './UI/ballCollision';
import Goalkeeper from './UI/goalkeeper';
import { HitboxDebug } from './UI/hitbox';
import Goalkeeper2 from './UI2/goalkeeper2';

export default class App extends Application {
    private ground!: Ground;
    private goal!: Goal;
    private scoreDisplay!: ScoreDisplay;
    private ballCountDisplay!: BallCountDisplay;
    private startScreen!: StartScreen;
    private goalkeeper!: Goalkeeper;
    private playerSpine: Spine | null = null;

    private currentBall: BallGame | null = null;
    private gameContainer: Container;
    private isGameActive: boolean = false;
    private shotsLeft: number = 5;

    private ballcollision: BallCollision;
    private resetButton!: Container;
    private homeButton!: Container;
    private hitboxDebug!: HitboxDebug;
    private currentMode: 'play' | 'other' = 'play';

    // Goalkeeper Mode elements
    private gkModeContainer!: Container;
    private gkBg!: Sprite;
    private gkGoalSprite!: Sprite;
    private gkNetSprite!: Sprite;
    private gkBall!: Container;
    private gkKeeper2: Goalkeeper2 | null = null;
    private gkScaleY: number = 1;

    constructor() {
        super();
        this.gameContainer = new Container();
        this.gameContainer.visible = false;
        this.ballcollision = new BallCollision();
        this.hitboxDebug = new HitboxDebug();
    }

    async init() {
        await super.init({
            background: '#1099bb',
            resizeTo: window,
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            antialias: true
        });

        const mount = document.getElementById('app');
        if (mount) mount.appendChild(this.canvas);
        else document.body.appendChild(this.canvas);

        const manifest = {
            bundles: [
                {
                    name: 'game-screen',
                    assets: [
                        { alias: '/assets/arts/goal.png', src: '/assets/arts/goal.png' },
                        { alias: '/assets/arts/net.png', src: '/assets/arts/net.png' },

                        { alias: '/assets/arts/startscreen.png', src: '/assets/arts/startscreen.png' },
                        { alias: '/assets/arts/ball.png', src: '/assets/arts/ball.png' },
                        { alias: '/assets/arts/BG_1.png', src: '/assets/arts/BG_1.png' },
                        { alias: '/assets/arts/DEMO_1.png', src: '/assets/arts/DEMO_1.png' },
                        { alias: '/assets/arts/Goal_1_a.png', src: '/assets/arts/Goal_1_a.png' },
                        { alias: '/assets/arts/Goal_1_b.png', src: '/assets/arts/Goal_1_b.png' },
                        { alias: '/assets/arts/Goal_2_a.png', src: '/assets/arts/Goal_2_a.png' },
                        { alias: '/assets/arts/Goal_2_b.png', src: '/assets/arts/Goal_2_b.png' },
                        { alias: '/assets/arts/BG_2.png', src: '/assets/arts/BG_2.png' },
                        { alias: '/assets/arts/btn_pause.png', src: '/assets/arts/btn_pause.png' },
                        { alias: '/assets/arts/btn_sound_off.png', src: '/assets/arts/btn_sound_off.png' },
                        { alias: '/assets/arts/user_frame.png', src: '/assets/arts/user_frame.png' },
                        { alias: '/assets/arts/btn_sound_on.png', src: '/assets/arts/btn_sound_on.png' },
                        { alias: '/assets/arts/user.png', src: '/assets/arts/user.png' }
                    ],
                },
            ],
        };

        await Assets.init({ manifest });

        const loadedAssets = await Assets.loadBundle('game-screen');

        this.stage.addChild(this.gameContainer);

        // Add hitbox debug to gameContainer để scale cùng game
        this.gameContainer.addChild(this.hitboxDebug);

        // ... Root Scale Logic ...
        const updateRootScale = () => {
            try {
                const sx = window.innerWidth / BASE_WIDTH;
                const sy = window.innerHeight / BASE_HEIGHT;
                const s = Math.min(sx, sy);
                this.gameContainer.scale.set(s, s);
                const displayW = BASE_WIDTH * s;
                const displayH = BASE_HEIGHT * s;
                this.gameContainer.x = Math.round((window.innerWidth - displayW) / 2);
                this.gameContainer.y = Math.round((window.innerHeight - displayH) / 2);
                // Scale gkModeContainer the same way
                if (this.gkModeContainer) {
                    this.gkModeContainer.scale.set(s, s);
                    this.gkModeContainer.x = Math.round((window.innerWidth - displayW) / 2);
                    this.gkModeContainer.y = Math.round((window.innerHeight - displayH) / 2);
                }
            } catch (e) { /* updateRootScale failed */ }
        };
        updateRootScale();
        window.addEventListener('resize', updateRootScale);

        this.ground = new Ground();
        this.gameContainer.addChild(this.ground);

        this.goalkeeper = new Goalkeeper();
        this.gameContainer.addChild(this.goalkeeper);

        this.goal = new Goal();
        this.gameContainer.addChild(this.goal);

        this.scoreDisplay = new ScoreDisplay();
        this.gameContainer.addChild(this.scoreDisplay);

        // Add hitbox debug to gameContainer at top layer
        this.gameContainer.addChild(this.hitboxDebug);

        // Goalkeeper Mode Container - create elements directly
        this.gkModeContainer = new Container();
        this.gkModeContainer.visible = false;
        this.stage.addChild(this.gkModeContainer);
        this.initGoalkeeperModeElements();
        // Apply initial scale (updateRootScale ran before gkModeContainer existed)
        updateRootScale();

        this.ticker.add(this.update.bind(this));

        this.createResetButton();
        this.createHomeButton();

        // Keyboard controls for debug
        window.addEventListener('keydown', (e) => {
            if (e.key === 'h' || e.key === 'H') {
                this.hitboxDebug.toggleDebugMode();
            }
        });

        this.startScreen = new StartScreen();
        this.startScreen.onSelect = (mode) => this.startGame(mode);
        this.stage.addChild(this.startScreen);

        // Load Spine goalkeeper LAST so it's on top layer
        await this.loadGoalkeeperSpine();

        // Load player spine
        await this.loadPlayerSpine();
    }

    //#region Goalkeeper Mode Setup
    private initGoalkeeperModeElements() {
        this.gkScaleY = screen.height / BASE_HEIGHT;

        // 1. Background BG_2
        this.gkBg = Sprite.from('/assets/arts/BG_2.png');
        this.gkBg.anchor.set(0.5, 0.5);
        this.gkModeContainer.addChild(this.gkBg);

        // 2. Keeper placeholder (Goalkeeper2 added later when spine loads)
        // gkKeeper2 will be inserted at index 1 (after bg, before net)

        // 3. Net (behind goal frame)
        this.gkNetSprite = Sprite.from('/assets/arts/Goal_2_b.png');
        this.gkNetSprite.anchor.set(0.5, 1);
        this.gkModeContainer.addChild(this.gkNetSprite);

        // 4. Goal frame
        this.gkGoalSprite = Sprite.from('/assets/arts/Goal_2_a.png');
        this.gkGoalSprite.anchor.set(0.5, 1);
        this.gkModeContainer.addChild(this.gkGoalSprite);

        // 5. Ball (on top)
        this.gkBall = new Container();
        const ballSprite = Sprite.from('/assets/arts/ball.png');
        ballSprite.anchor.set(0.5, 0.5);
        ballSprite.width = 200;
        ballSprite.height = 200;
        this.gkBall.addChild(ballSprite);
        this.gkModeContainer.addChild(this.gkBall);

        // Layout when textures are ready
        if (this.gkGoalSprite.texture && this.gkGoalSprite.texture.width > 1) {
            this.updateGKLayout();
        } else {
            this.gkGoalSprite.texture.on('update', () => this.updateGKLayout());
        }
        if (this.gkNetSprite.texture) {
            this.gkNetSprite.texture.on('update', () => this.updateGKLayout());
        }

        window.addEventListener('resize', () => this.updateGKLayout());
    }

    private updateGKLayout() {
        this.gkScaleY = screen.height / BASE_HEIGHT;

        // Background: cover full area
        if (this.gkBg.texture && this.gkBg.texture.width > 1) {
            const bgScale = Math.max(
                BASE_WIDTH / this.gkBg.texture.width,
                BASE_HEIGHT / this.gkBg.texture.height
            );
            this.gkBg.scale.set(bgScale);
            this.gkBg.x = BASE_WIDTH / 2;
            this.gkBg.y = BASE_HEIGHT / 2;
        }

        // Goal Y position (same formula pattern as kick mode Goal)
        const goalY = Math.round(BASE_HEIGHT * this.gkScaleY / (1.14 * this.gkScaleY));

        // Goal frame
        if (this.gkGoalSprite.texture && this.gkGoalSprite.texture.width > 1) {
            const goalTargetWidth = BASE_WIDTH * 0.95;
            const s = goalTargetWidth / this.gkGoalSprite.texture.width;
            this.gkGoalSprite.scale.set(s);
            this.gkGoalSprite.x = BASE_WIDTH / 2;
            this.gkGoalSprite.y = goalY;
        }

        // Net
        if (this.gkNetSprite.texture && this.gkNetSprite.texture.width > 1) {
            const netTargetWidth = BASE_WIDTH * 0.95;
            const s = netTargetWidth / this.gkNetSprite.texture.width;
            this.gkNetSprite.scale.set(s);
            this.gkNetSprite.x = BASE_WIDTH / 2;
            this.gkNetSprite.y = goalY;
        }

        // Ball: above goal, small (far away)
        this.gkBall.x = BASE_WIDTH / 2;
        this.gkBall.y = BASE_HEIGHT * 0.45;
        this.gkBall.scale.set(0.5);

        // Keeper: set initial position at center-bottom of goal
        if (this.gkKeeper2) {
            this.gkKeeper2.setInitialPosition(BASE_WIDTH / 2, goalY * 0.89);
        }
    }

    private initGKKeeperSpine() {
        try {
            const gkSpine = Spine.from({ skeleton: 'goalkeeperData', atlas: 'goalkeeperAtlas', scale: 0.5 });
            if (!gkSpine) return;

            this.gkKeeper2 = new Goalkeeper2();
            this.gkKeeper2.init(gkSpine);
            this.gkKeeper2.setSwipeArea(this.gkModeContainer);

            // Scale keeper to ~45% of goal height
            const goalH = this.gkGoalSprite.height;
            const targetH = goalH * 0.45;
            const bounds = gkSpine.getLocalBounds();
            if (bounds && bounds.height > 0) {
                gkSpine.scale.set(targetH / bounds.height);
            }

            // Insert at index 1 (after bg, before net) so keeper is behind goal
            this.gkModeContainer.addChildAt(this.gkKeeper2, 1);
            this.updateGKLayout();
        } catch (e) {
            console.warn('Failed to create keeper spine for GK mode:', e);
        }
    }

    //#region Spine Loading
    private async loadGoalkeeperSpine() {
        try {
            // Load skeleton and atlas using PIXI.Assets
            Assets.add({ alias: 'goalkeeperData', src: '/assets/anim/Gkeeper/skeleton.json' });
            Assets.add({ alias: 'goalkeeperAtlas', src: '/assets/anim/Gkeeper/skeleton.atlas' });
            await Assets.load(['goalkeeperData', 'goalkeeperAtlas']);

            // Create Spine instance for kick mode
            const spine = Spine.from({ skeleton: 'goalkeeperData', atlas: 'goalkeeperAtlas', scale: 0.5 });

            if (!spine) {
                throw new Error('Failed to create spine');
            }

            this.goalkeeper = new Goalkeeper();
            this.goalkeeper.init(spine);
            this.goalkeeper.setGoal(this.goal);

            this.goalkeeper.visible = true;
            this.goalkeeper.alpha = 1;

            this.gameContainer.addChild(this.goalkeeper);

            // Ensure goalkeeper is on top layer
            this.gameContainer.setChildIndex(this.goalkeeper, this.gameContainer.children.length - 1);

            // Now also init keeper spine for GK mode (assets already loaded)
            this.initGKKeeperSpine();

        } catch (error) {
            // Failed to load Goalkeeper Spine
        }
    }

    private async loadPlayerSpine() {
        try {
            // Load player spine assets
            Assets.add({ alias: 'playerData', src: '/assets/anim/player/skeleton.json' });
            Assets.add({ alias: 'playerAtlas', src: '/assets/anim/player/skeleton.atlas' });
            await Assets.load(['playerData', 'playerAtlas']);

            // Create player spine instance
            this.playerSpine = Spine.from({ skeleton: 'playerData', atlas: 'playerAtlas', scale: 1.2 });

            if (this.playerSpine) {
                this.playerSpine.x = 400;
                this.playerSpine.y = 600;
                this.playerSpine.visible = false;
                this.gameContainer.addChild(this.playerSpine);
            }
        } catch (error) {
            // Failed to load Player Spine
        }
    }

    //#region Game Mode Switching
    startGame(mode: 'play' | 'other') {
        this.currentMode = mode;
        this.startScreen.visible = false;

        if (mode === 'other') {
            this.startGoalkeeperMode();
        } else {
            this.startKickMode();
        }

        if (this.resetButton) this.resetButton.visible = true;
        if (this.homeButton) this.homeButton.visible = true;
    }

    private startKickMode() {
        this.gameContainer.visible = true;
        this.gkModeContainer.visible = false;
        this.isGameActive = true;
        this.scoreDisplay.reset();
        this.shotsLeft = 10;
        this.createNewBall();

        if (this.goalkeeper) this.goalkeeper.reset();
        if (this.hitboxDebug) this.hitboxDebug.visible = true;
    }

    private startGoalkeeperMode() {
        this.gameContainer.visible = false;
        this.gkModeContainer.visible = true;
        this.isGameActive = true;
        if (this.gkKeeper2) this.gkKeeper2.reset();
        this.updateGKLayout();
    }

    createNewBall() {
        if (this.shotsLeft <= 0) {
            this.endGame();
            return;
        }
        if (this.currentBall) {
            this.currentBall.destroy();
            this.gameContainer.removeChild(this.currentBall);
            this.currentBall = null;
        }
        this.currentBall = new BallGame();

        this.currentBall.x = 0;
        this.currentBall.y = 0;

        this.currentBall.setPlayerSpine(this.playerSpine);
        this.currentBall.setGoalkeeper(this.goalkeeper);
        this.gameContainer.addChild(this.currentBall);

        // Reset thủ môn
        if (this.goalkeeper) this.goalkeeper.reset();
    }

    update(ticker: Ticker) {
        // Goalkeeper mode: update keeper physics
        if (this.currentMode === 'other') {
            if (this.gkKeeper2) this.gkKeeper2.updatePhysics();
            return;
        }

        if (this.goalkeeper) {
            this.goalkeeper.UpdatePhysics();
        }

        // Update hitbox debug luôn nếu có ball và goalkeeper
        if (this.currentBall && this.goalkeeper && this.hitboxDebug) {
            this.hitboxDebug.update(this.currentBall, this.goalkeeper);
        }

        if (!this.isGameActive || !this.currentBall) return;

        if (this.currentBall.isFlying) {
            this.ballcollision.checkCollision(this.currentBall, this.goal, this.goalkeeper);
        }

        this.goalkeeper.setTargetBall(this.currentBall);
    }

    handleShotEnd() {
        this.shotsLeft--;
        setTimeout(() => {
            this.createNewBall();
        }, 2000);
    }

    endGame() {
        this.isGameActive = false;
        this.gameContainer.visible = false;
        this.gkModeContainer.visible = false;
        this.startScreen.visible = true;
        this.currentMode = 'play';
        if (this.resetButton) this.resetButton.visible = false;
        if (this.homeButton) this.homeButton.visible = false;
    }

    private createResetButton() {
        this.resetButton = new Container();
        const bg = new Graphics();
        bg.roundRect(0, 0, 120, 40, 6);
        bg.fill({ color: 0x000000, alpha: 0.6 });
        const style = new TextStyle({ fill: '#ffffff', fontSize: 14 });
        const label = new Text({ text: 'Build 15', style });
        label.anchor.set(0.5, 0.5);
        label.x = 60;
        label.y = 20;
        this.resetButton.addChild(bg);
        this.resetButton.addChild(label);
        this.resetButton.x = this.gameContainer.x + 12;
        this.resetButton.y = this.gameContainer.y + 12;
        this.resetButton.eventMode = 'static';
        this.resetButton.cursor = 'pointer';
        this.resetButton.on('pointerdown', () => {
            if (this.currentMode === 'other') {
                if (this.gkKeeper2) this.gkKeeper2.reset();
            } else {
                if (this.currentBall) {
                    try { this.currentBall.reset(); } catch (e) { /* Reset failed */ }
                }
                if (this.goalkeeper) this.goalkeeper.reset();
            }
        });
        this.resetButton.visible = false;
        this.stage.addChild(this.resetButton);
        window.addEventListener('resize', () => {
            this.resetButton.x = this.gameContainer.x + 12;
            this.resetButton.y = this.gameContainer.y + 12;
        });
    }

    private createHomeButton() {
        this.homeButton = new Container();
        const bg = new Graphics();
        bg.roundRect(0, 0, 100, 40, 6);
        bg.fill({ color: 0x4CAF50, alpha: 0.8 });
        const style = new TextStyle({ fill: '#ffffff', fontSize: 16, fontWeight: 'bold' });
        const label = new Text({ text: '🏠 Home', style });
        label.anchor.set(0.5, 0.5);
        label.x = 50;
        label.y = 20;
        this.homeButton.addChild(bg);
        this.homeButton.addChild(label);
        this.homeButton.x = this.gameContainer.x + 142;
        this.homeButton.y = this.gameContainer.y + 12;
        this.homeButton.eventMode = 'static';
        this.homeButton.cursor = 'pointer';
        this.homeButton.on('pointerdown', () => {
            this.endGame();
        });
        this.homeButton.visible = false;
        this.stage.addChild(this.homeButton);
        window.addEventListener('resize', () => {
            this.homeButton.x = this.gameContainer.x + 142;
            this.homeButton.y = this.gameContainer.y + 12;
        });
    }
}
