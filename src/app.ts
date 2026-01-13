import { Application, Assets, Container } from 'pixi.js';
import Goal from './UI/goal.js';
import Ball from './UI/ball.js';
import Ground from './UI/ground.js';
import Goalkeeper from './UI/goalkeeper.js';
import ScoreDisplay from './UI/scoreDisplay.js';
import { GAME_CONFIG } from './constant/global.js';
import { Layer, addToLayer } from './ControllUI/layers.js';

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
    await Assets.load(['./arts/goal.png', './arts/ball.png', './arts/net.png', './arts/gkeeper.png', './arts/gkeeper2.png']);
  }
  catch (e) {
    // ignore load errors here; components will listen for texture update
  }

  // Create Ground first (background layer)
  const ground = new Ground();
  addToLayer(container, ground, Layer.GROUND);

  // Create Goal instance with layered system
  const goal = new Goal();
  addToLayer(container, goal, Layer.NET); // This adds the net (back layer)
  
  // Goal front layer will be added once with proper layering
  const goalFrontLayer = goal.getFrontLayer();
  addToLayer(container, goalFrontLayer, Layer.GOAL_FRONT);

  // Create Goalkeeper
  const goalkeeper = new Goalkeeper();
  goalkeeper.setGoal(goal); // Set goal reference for scale calculation
  addToLayer(container, goalkeeper, Layer.GOAL_FRONT); // Same layer as goal front

  // Create Score Display
  const scoreDisplay = new ScoreDisplay();
  addToLayer(container, scoreDisplay, Layer.GOAL_FRONT); // Top layer

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
    
    currentBall = new Ball(gameState, goal, goalkeeper);
    
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
      scoreDisplay.addGoal();
      // You can add score tracking, visual effects, or other game logic here
    };
    
    // Set callback for when goalkeeper saves
    currentBall.saveCallback = () => {
      scoreDisplay.addSave();
    };
    
    addToLayer(container, currentBall, Layer.BALL);
  }
  
  // Reset ball function
  function resetBall() {
    if (currentBall) {
      // Clear callback to prevent infinite loop
      currentBall.onBallDestroyed = undefined;
      container.removeChild(currentBall);
      currentBall.destroy();
      currentBall = null;
    }
    
    // Reset goalkeeper to initial position and state
    goalkeeper.reset();
    
    // Reset score display
    scoreDisplay.reset();
    
    // Reset game state if needed
    gameState.gameOver = false;
    if (gameState.ballsRemaining <= 0) {
      gameState.ballsRemaining = 1; // Give at least one ball for reset
    }
    
    // Create new ball
    createNewBall();
    console.log("Ball and goalkeeper reset!");
  }
  
  // Add reset button event listener
  const resetButton = document.getElementById('reset-btn');
  if (resetButton) {
    resetButton.addEventListener('click', resetBall);
  }
  
  // Add keyboard event listener for Z key
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'z') {
      resetBall();
    }
  });
  
  // Create initial ball
  createNewBall();
})();