import { Application, Assets, Container } from 'pixi.js';
import Goal from './UI/goal.js';
import Ball from './UI/ball.js';
import Ground from './UI/ground.js';
import { GAME_CONFIG } from './constant/global.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application with transparent background (ground will provide background)
  await app.init({ backgroundAlpha: 0, resizeTo: window });

  // Append the application canvas to the app container in the page
  const mount = document.getElementById('app') || document.body;
  mount.appendChild(app.view as HTMLCanvasElement);

  // Create and add a container to the stage
  const container = new Container();
  app.stage.addChild(container);

  // Load assets
  try {
    await Assets.load(['/Assets/arts/goal.png', '/Assets/arts/ball.png']);
  }
  catch (e) {
    // ignore load errors here; components will listen for texture update
  }

  // Create Ground first (background layer)
  const ground = new Ground();
  container.addChild(ground);

  // Create Goal instance (includes both image and collision posts)
  const goal = new Goal();
  container.addChild(goal);

  // Game state management
  const gameState = {
    ballsRemaining: GAME_CONFIG.MAX_BALLS,
    gameOver: false,
  };
  
  function decrementBalls() {
    gameState.ballsRemaining--;
    if (gameState.ballsRemaining <= 0) {
      gameState.gameOver = true;
    }
  }

  // Ball management
  let currentBall: Ball | null = null;
  
  function createNewBall() {
    if (gameState.gameOver) {
      console.log("GAME OVER! No more balls remaining.");
      return;
    }
    
    currentBall = new Ball(gameState, goal);
    
    // Set callback for when ball is destroyed
    currentBall.onBallDestroyed = () => {
      if (currentBall) {
        container.removeChild(currentBall);
        currentBall.destroy();
        currentBall = null;
        
        // Decrement ball count
        decrementBalls();
        
        // Create new ball if game not over
        if (!gameState.gameOver) {
          createNewBall();
        }
      }
    };
    
    // Set callback for when goal is scored with zone information
    currentBall.goalScoredCallback = (zone: any) => {
      console.log(`⚽ GOAL! Ball scored in zone ${zone.id}`);
      // You can add score tracking, visual effects, or other game logic here
    };
    
    container.addChild(currentBall);
  }
  
  // Create initial ball
  createNewBall();
})();