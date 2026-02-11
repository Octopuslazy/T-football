import { Application, Container, Ticker, Assets, Graphics, Text, TextStyle, Texture } from 'pixi.js';
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
    private hitboxDebug!: HitboxDebug;

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
                        { alias: '/assets/arts/Goal_2_b.png', src: '/assets/arts/Goal_2_b.png' }
                    ],
                },
            ],
        };

        await Assets.init({ manifest });
        
        const loadedAssets = await Assets.loadBundle('game-screen');

        this.stage.addChild(this.gameContainer);
        
        // Add hitbox debug to gameContainer để scale cùng game
        this.gameContainer.addChild(this.hitboxDebug);

        // ... Root Scale Logic (Giữ nguyên) ...
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

        // this.ballCountDisplay = new BallCountDisplay();
        // this.ballCountDisplay.setGoal(this.goal);
        // this.gameContainer.addChild(this.ballCountDisplay);
        
        // Add hitbox debug to gameContainer at top layer
        this.gameContainer.addChild(this.hitboxDebug);
        

        this.ticker.add(this.update.bind(this));

        this.createResetButton();

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

    private async loadGoalkeeperSpine() {
        try {
            // Load skeleton and atlas using PIXI.Assets
            Assets.add({ alias: 'goalkeeperData', src: '/assets/anim/Gkeeper/skeleton.json' });
            Assets.add({ alias: 'goalkeeperAtlas', src: '/assets/anim/Gkeeper/skeleton.atlas' });
            await Assets.load(['goalkeeperData', 'goalkeeperAtlas']);
            
            // Create Spine instance
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
                // Set player position
                this.playerSpine.x = 400;
                this.playerSpine.y = 600;
                
                // Hide player initially - will show when shooting
                this.playerSpine.visible = false;
                
                // Add to game container
                this.gameContainer.addChild(this.playerSpine);
            }
        } catch (error) {
            // Failed to load Player Spine
        }
    }

    startGame(mode: 'play' | 'other') {
        this.startScreen.visible = false;
        this.gameContainer.visible = true;
        this.isGameActive = true;
        this.scoreDisplay.reset();
        this.shotsLeft = 10;
        // this.ballCountDisplay.setCount(this.shotsLeft);
        this.createNewBall();
        if (this.resetButton) this.resetButton.visible = true;
        
        // Reset thủ môn
        if (this.goalkeeper) this.goalkeeper.reset();
        
        // Ensure hitbox debug is visible
        if (this.hitboxDebug) {
            this.hitboxDebug.visible = true;
            console.log('🎯 Hitbox debug enabled for game');
        }
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
        // this.ballCountDisplay.setCount(this.shotsLeft);
        setTimeout(() => {
            this.createNewBall();
        }, 2000);
    }

    endGame() {
        this.isGameActive = false;
        this.gameContainer.visible = false;
        this.startScreen.visible = true;
        if (this.resetButton) this.resetButton.visible = false;
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
            if (this.currentBall) {
                try { this.currentBall.reset(); } catch (e) { /* Reset failed */ }
            }
            if (this.goalkeeper) this.goalkeeper.reset();
        });
        this.resetButton.visible = false;
        this.stage.addChild(this.resetButton);
        window.addEventListener('resize', () => {
            this.resetButton.x = this.gameContainer.x + 12;
            this.resetButton.y = this.gameContainer.y + 12;
        });
    }
}