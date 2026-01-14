import { Application, Assets, Container } from 'pixi.js';
import Goal from './UI/goal.js';
import Ball from './UI/ball.js';
import Ground from './UI/ground.js';
import Goalkeeper from './UI/goalkeeper.js';
import ScoreDisplay from './UI/scoreDisplay.js';
import BallCountDisplay from './UI/ballCountDisplay.js';
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

  // Create Ball Count Display
  const ballCountDisplay = new BallCountDisplay();
  addToLayer(container, ballCountDisplay, Layer.GOAL_FRONT);
  // Let ball count scale/position relative to goal
  try { ballCountDisplay.setGoal(goal); } catch (e) {}

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
    // Update ball count UI: show balls remaining excluding current ball in play
    // If currentBall exists, visual remaining = gameState.ballsRemaining - 1
    const visual = Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0));
    try { ballCountDisplay.setCount(visual); } catch (e) {}
  }

  // Ball management
  let currentBall: Ball | null = null;
  let nextBallTimer: any = null;

  function removeAllBalls() {
    // Remove and destroy any Ball instances currently in the container
    const toRemove: any[] = [];
    container.children.forEach((c: any) => {
      if (c instanceof Ball) toRemove.push(c);
    });
    toRemove.forEach((b) => {
      try {
        if (b.onBallDestroyed) b.onBallDestroyed = undefined;
      } catch (e) {}
      try { container.removeChild(b); } catch (e) {}
      try { b.destroy(); } catch (e) {}
      if (currentBall === b) currentBall = null;
    });
  }
  
  function createNewBall() {
    if (gameState.gameOver) {
      console.log("GAME OVER! No more balls remaining.");
      return;
    }
    
    currentBall = new Ball(gameState, goal, goalkeeper);
    
    // Set callback for when ball is destroyed
    currentBall.onBallDestroyed = () => {
      // If a ball is destroyed (out of play), schedule the next ball after respawn delay
      if (currentBall) {
        container.removeChild(currentBall);
        currentBall.destroy();
        currentBall = null;
      }
      scheduleNextBallIfNeeded();
    };
    
    // Set callback for when goal is scored with zone information
    currentBall.goalScoredCallback = (zone: any) => {
      console.log(`⚽ GOAL! Ball scored in zone ${zone.id}`);
      scoreDisplay.addGoal();
      // Schedule reset and next ball after delay
      scheduleNextBallIfNeeded();
      // You can add score tracking, visual effects, or other game logic here
    };
    
    // Set callback for when goalkeeper saves
    currentBall.saveCallback = () => {
      scoreDisplay.addSave();
      // Schedule reset and next ball after delay
      scheduleNextBallIfNeeded();
    };

    // Set callback for outbound/insufficient power shots
    currentBall.outCallback = () => {
      scoreDisplay.addOut();
      // Schedule next ball now (match goal/save behavior) so spawn timing matches other outcomes
      scheduleNextBallIfNeeded();
    };
    
    addToLayer(container, currentBall, Layer.BALL);

    // Update visual ball count when a new ball is spawned
    const visualNow = Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0));
    try { ballCountDisplay.setCount(visualNow); } catch (e) {}
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
    // Do not reset scores here; keep them for the turn
    // scoreDisplay.reset();
    
    // Reset game state if needed
    gameState.gameOver = false;
    if (gameState.ballsRemaining <= 0) {
      gameState.ballsRemaining = 1; // Give at least one ball for reset
    }
    
    // Create new ball
    createNewBall();
    console.log("Ball and goalkeeper reset!");

    // Update ball count display when manual reset
    const visual = Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0));
    try { ballCountDisplay.setCount(visual); } catch (e) {}
  }

  function scheduleNextBallIfNeeded() {
    if (gameState.gameOver) return;
    if (nextBallTimer) return; // already scheduled

    nextBallTimer = setTimeout(() => {
      // After respawn delay, remove any existing balls then create the next one
      removeAllBalls();
      nextBallTimer = null;

      // Decrement ball count for the completed attempt
      decrementBalls();

      // Reset goalkeeper (but keep scores)
      goalkeeper.reset();

      // If no balls remain, show game end popup
      if (gameState.gameOver) {
        showGameEndPopup();
        return;
      }

      // Create next ball
      createNewBall();
    }, GAME_CONFIG.GOAL_RESPAWN_DELAY);
  }

  function showGameEndPopup() {
    // Create simple DOM popup overlay
    const existing = document.getElementById('game-end-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'game-end-popup';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.padding = '48px';
    popup.style.background = 'rgba(0,0,0,0.85)';
    popup.style.color = 'white';
    popup.style.fontSize = '20px';
    popup.style.borderRadius = '12px';
    popup.style.zIndex = '9999';
    // Double the popup size visually
    popup.style.transform = 'translate(-50%, -50%) scale(2)';

    const stats = scoreDisplay.getStats();
    popup.innerHTML = `<div style="text-align:center;"><h2 style=\"margin:0 0 12px 0;\">Game End</h2>
      <p style=\"margin:8px 0;\">Goals: ${stats.goals} &nbsp; Saves: ${stats.saves} &nbsp; Outs: ${stats.outs}&nbsp; Shots: ${stats.shots}</p>
      <p style=\"margin:8px 0;\">Accuracy: ${stats.accuracy}%</p>
      <button id=\"game-end-restart\" style=\"margin-top:12px;padding:10px 18px;font-size:16px;border-radius:6px;\">Play Again</button>
    </div>`;

    document.body.appendChild(popup);

    const btn = document.getElementById('game-end-restart');
    if (btn) {
      btn.addEventListener('click', () => {
        popup.remove();
        // Reset scores and state
        scoreDisplay.reset();
        gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS;
        gameState.gameOver = false;
        // Update ball count display
        try { ballCountDisplay.setCount(Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0))); } catch (e) {}
        createNewBall();
      });
    }
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