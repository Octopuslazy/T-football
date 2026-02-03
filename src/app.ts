import { Application, Container, Ticker, Assets, Graphics, Text, TextStyle } from 'pixi.js';
import { BallGame } from './UI/ball';
import Goal from './UI/goal';
import Ground from './UI/ground';
import ScoreDisplay from './UI/scoreDisplay';
import StartScreen from './UI/startScreen';
import BallCountDisplay from './UI/ballCountDisplay';
import { BASE_WIDTH, BASE_HEIGHT } from './constant/global';
import { BallCollision } from './UI/ballCollision';
import Goalkeeper from './UI/goalkeeper';
import '@pixi/spine-pixi'; // Import plugin

export default class App extends Application {
    private ground!: Ground;
    private goal!: Goal;
    private scoreDisplay!: ScoreDisplay;
    private ballCountDisplay!: BallCountDisplay;
    private startScreen!: StartScreen;
    private goalkeeper!: Goalkeeper;

    private currentBall: BallGame | null = null;
    private gameContainer: Container;
    private isGameActive: boolean = false;
    private shotsLeft: number = 5;

    private ballcollision: BallCollision;
    private resetButton!: Container;

    constructor() {
        super();
        this.gameContainer = new Container();
        this.gameContainer.visible = false;
        this.ballcollision = new BallCollision();
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
                        { alias: '/Assets/arts/goal.png', src: '/Assets/arts/goal.png' },
                        { alias: '/Assets/arts/net.png', src: '/Assets/arts/net.png' },
                        
                        // --- SỬA PHẦN SPINE (QUAN TRỌNG) ---
                        // 1. Load JSON
                        { alias: 'gkeeperJson', src: '/Assets/anim/Gkeeper/skeleton.json' },
                        
                        // ----------------------------------

                        { alias: '/Assets/arts/startscreen.png', src: '/Assets/arts/startscreen.png' },
                        { alias: '/Assets/arts/ball.png', src: '/Assets/arts/ball.png' },
                        { alias: '/Assets/arts/BG_1.png', src: '/Assets/arts/BG_1.png' },
                        { alias: '/Assets/arts/DEMO_1.png', src: '/Assets/arts/DEMO_1.png' },
                        { alias: '/Assets/arts/goal_1_a.png', src: '/Assets/arts/goal_1_a.png' },
                        { alias: '/Assets/arts/goal_1_b.png', src: '/Assets/arts/goal_1_b.png' },
                        { alias: '/Assets/arts/goal_2_a.png', src: '/Assets/arts/goal_2_a.png' },
                        { alias: '/Assets/arts/goal_2_b.png', src: '/Assets/arts/goal_2_b.png' }
                    ],
                },
            ],
        };

        await Assets.init({ manifest });
        
        console.log('Start loading assets...');
        const loadedAssets = await Assets.loadBundle('game-screen');
        console.log('Assets loaded!');

        this.stage.addChild(this.gameContainer);

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
            } catch (e) { console.warn('updateRootScale failed', e); }
        };
        updateRootScale();
        window.addEventListener('resize', updateRootScale);

        this.ground = new Ground();
        this.gameContainer.addChild(this.ground);

        this.goal = new Goal();
        this.gameContainer.addChild(this.goal);

        this.scoreDisplay = new ScoreDisplay();
        this.gameContainer.addChild(this.scoreDisplay);

        this.ballCountDisplay = new BallCountDisplay();
        this.ballCountDisplay.setGoal(this.goal);
        this.gameContainer.addChild(this.ballCountDisplay);

        this.goalkeeper = new Goalkeeper();
        this.goalkeeper.init(Assets.gkeeperJson); // 🔥 Spine instance
        this.goalkeeper.setGoal(this.goal);
        this.gameContainer.addChild(this.goalkeeper);

        
        this.ticker.add(this.update.bind(this));

        this.createResetButton();

        this.startScreen = new StartScreen();
        this.startScreen.onSelect = (mode) => this.startGame(mode);
        this.stage.addChild(this.startScreen);
        this.createResetButton();

        this.ticker.add(this.update.bind(this));
    }

    startGame(mode: 'play' | 'other') {
        this.startScreen.visible = false;
        this.gameContainer.visible = true;
        this.isGameActive = true;
        this.scoreDisplay.reset();
        this.shotsLeft = 10;
        this.ballCountDisplay.setCount(this.shotsLeft);
        this.createNewBall();
        if (this.resetButton) this.resetButton.visible = true;
        
        // Reset thủ môn
        if (this.goalkeeper) this.goalkeeper.reset();
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
        this.gameContainer.addChild(this.currentBall);
        
        // Reset thủ môn
        if (this.goalkeeper) this.goalkeeper.reset();
    }

    update(ticker: Ticker) {
        if (!this.isGameActive || !this.currentBall) return;
        if (this.currentBall.isFlying) {
            this.ballcollision.checkCollision(this.currentBall, this.goal);
        }
    }

    handleShotEnd() {
        this.shotsLeft--;
        this.ballCountDisplay.setCount(this.shotsLeft);
        setTimeout(() => {
            this.createNewBall();
        }, 2000);
    }

    endGame() {
        console.log("Game Over");
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
        const label = new Text({ text: 'Reset Ball', style });
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
                try { this.currentBall.reset(); } catch (e) { console.warn('Reset failed', e); }
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