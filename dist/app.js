import { Application, Container, Assets } from 'pixi.js';
import { BallGame } from './UI/ball';
import Goal from './UI/goal';
// Goalkeeper temporarily disabled
import Ground from './UI/ground';
import ScoreDisplay from './UI/scoreDisplay';
import StartScreen from './UI/startScreen';
import BallCountDisplay from './UI/ballCountDisplay';
import { BASE_WIDTH, BASE_HEIGHT } from './constant/global';
import { BallCollision } from './UI/ballCollision';
export default class App extends Application {
    constructor() {
        super();
        this.currentBall = null;
        this.isGameActive = false;
        this.shotsLeft = 5;
        this.gameContainer = new Container();
        this.gameContainer.visible = false; // Ẩn game lúc đầu để hiện StartScreen
        this.ballcollision = new BallCollision();
    }
    async init() {
        // 1. Khởi tạo Pixi Application
        await super.init({
            background: '#1099bb',
            resizeTo: window,
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            antialias: true
        });
        // Attach canvas to #app if present (keeps DOM organized), otherwise append to body
        const mount = document.getElementById('app');
        if (mount) {
            mount.appendChild(this.canvas);
            console.log('Canvas appended to #app');
        }
        else {
            document.body.appendChild(this.canvas);
            console.log('Canvas appended to document.body');
        }
        // 2. QUAN TRỌNG: Tải trước tài nguyên (Preload Assets)
        // Load assets using their served absolute URLs as the registered name
        const assetMap = [
            { name: '/Assets/arts/goal.png', src: '/Assets/arts/goal.png' },
            { name: '/Assets/arts/net.png', src: '/Assets/arts/net.png' },
            { name: '/Assets/arts/gkeeper.png', src: '/Assets/arts/gkeeper.png' },
            { name: '/Assets/arts/gkeeper2.png', src: '/Assets/arts/gkeeper2.png' }, // nếu dùng
            { name: '/Assets/arts/startscreen.png', src: '/Assets/arts/startscreen.png' },
            { name: '/Assets/arts/ball.png', src: '/Assets/arts/ball.png' },
            { name: '/Assets/arts/BG_1.png', src: '/Assets/arts/BG_1.png' },
            { name: '/Assets/arts/DEMO_1.png', src: '/Assets/arts/DEMO_1.png' },
            { name: '/Assets/arts/goal_1_a.png', src: '/Assets/arts/goal_1_a.png' },
            { name: '/Assets/arts/goal_1_b.png', src: '/Assets/arts/goal_1_b.png' },
            { name: '/Assets/arts/goal_2_a.png', src: '/Assets/arts/goal_2_a.png' },
            { name: '/Assets/arts/goal_2_b.png', src: '/Assets/arts/goal_2_b.png' }
        ];
        // Chờ tải xong hết ảnh mới chạy tiếp
        await Assets.load(assetMap);
        // Debug: xác nhận các asset đã được load vào cache
        try {
            const loaded = assetMap.map(a => {
                const id = a.name || a.alias;
                const res = Assets.get?.(id);
                return { id, inCache: !!res, resource: res };
            });
            console.log('Assets.load complete — cache check:', loaded);
        }
        catch (e) {
            console.log('Assets.load complete (cache check failed):', e);
        }
        // 3. Khởi tạo các thành phần Game
        // Add gameContainer as a separate layer that will be scaled to fit the window
        // while UI overlays (StartScreen) use window coordinates directly.
        this.stage.addChild(this.gameContainer);
        // Setup root scaling to map design (`BASE_WIDTH` x `BASE_HEIGHT`) to actual window size
        const updateRootScale = () => {
            try {
                const sx = window.innerWidth / BASE_WIDTH;
                const sy = window.innerHeight / BASE_HEIGHT;
                // preserve aspect ratio
                const s = Math.min(sx, sy);
                this.gameContainer.scale.set(s, s);
                // center the scaled gameContainer inside the canvas
                const displayW = BASE_WIDTH * s;
                const displayH = BASE_HEIGHT * s;
                this.gameContainer.x = Math.round((window.innerWidth - displayW) / 2);
                this.gameContainer.y = Math.round((window.innerHeight - displayH) / 2);
            }
            catch (e) {
                console.warn('updateRootScale failed', e);
            }
        };
        // initial scale
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
        // 4. Khởi tạo Start Screen
        this.startScreen = new StartScreen();
        // Cài đặt sự kiện khi bấm nút Play
        this.startScreen.onSelect = (mode) => this.startGame(mode);
        this.stage.addChild(this.startScreen);
        // 5. Bắt đầu vòng lặp game
        this.ticker.add(this.update.bind(this));
        // Debug: sau init, in trạng thái hiển thị và kích thước canvas
        try {
            console.log('Post-init visibility: startScreen visible?', !!this.startScreen && this.startScreen.visible, 'gameContainer visible?', !!this.gameContainer && this.gameContainer.visible);
            const c = this.view || this.renderer?.view || this.canvas;
            if (c) {
                console.log('Canvas size (w x h):', c.width, 'x', c.height, 'window size:', window.innerWidth, 'x', window.innerHeight);
            }
            else {
                console.log('Canvas element not found on App instance');
            }
        }
        catch (e) {
            console.warn('Post-init debug failed:', e);
        }
    }
    // Chuyển từ màn hình Start sang màn hình chơi
    startGame(mode) {
        this.startScreen.visible = false;
        this.gameContainer.visible = true;
        this.isGameActive = true;
        // Reset trạng thái game
        this.scoreDisplay.reset();
        this.shotsLeft = 10;
        this.ballCountDisplay.setCount(this.shotsLeft);
        // Tạo quả bóng đầu tiên
        this.createNewBall();
    }
    // Hàm tạo bóng mới
    createNewBall() {
        // Kiểm tra nếu hết lượt sút
        if (this.shotsLeft <= 0) {
            this.endGame();
            return;
        }
        // Xóa bóng cũ nếu còn tồn tại
        if (this.currentBall) {
            this.currentBall.destroy();
            this.gameContainer.removeChild(this.currentBall);
            this.currentBall = null;
        }
        // Tạo bóng mới và thêm vào màn hình chơi
        this.currentBall = new BallGame();
        this.gameContainer.addChild(this.currentBall);
    }
    // Vòng lặp chính của game (chạy mỗi frame)
    update(ticker) {
        if (!this.isGameActive || !this.currentBall)
            return;
        if (this.currentBall.isFlying) {
            this.ballcollision.checkCollision(this.currentBall, this.goal);
        }
    }
    // Xử lý logic va chạm và kết quả
    // Xử lý khi kết thúc một lượt sút
    handleShotEnd() {
        this.shotsLeft--;
        this.ballCountDisplay.setCount(this.shotsLeft);
        // Đợi 2 giây rồi tạo bóng mới
        setTimeout(() => {
            this.createNewBall();
        }, 2000);
    }
    // Kết thúc game
    endGame() {
        console.log("Game Over");
        this.isGameActive = false;
        this.gameContainer.visible = false;
        this.startScreen.visible = true; // Hiện lại màn hình bắt đầu
    }
}
