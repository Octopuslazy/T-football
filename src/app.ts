import { Application, Assets, Container } from 'pixi.js';
import Goal from './UI/goal.js';
import Ball from './UI/ball.js';
import Ground from './UI/ground.js';
import Goalkeeper from './UI/goalkeeper.js';
import ScoreDisplay from './UI/scoreDisplay.js';
import BallCountDisplay from './UI/ballCountDisplay.js';
import StartScreen from './UI/startScreen.js';
import ReversedGoal from './UI-2/goal.js';
import Ball2 from './UI-2/ball2.js';
import Goalkeeper2 from './UI-2/goalkeeper2.js';
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
    await Assets.load(['./arts/goal.png', './arts/ball.png', './arts/net.png', './arts/gkeeper.png', './arts/gkeeper2.png', './arts/goal2.png', './arts/bg2.png', './arts/goal3.png', './arts/startscreen.png']);
  }
  catch (e) {
    // ignore load errors here; components will listen for texture update
  }

  // Defer creation of major UI until user selects mode on the StartScreen.
  let ground: Ground | null = null;
  let goal: Goal | null = null;
  let goalFrontLayer: any = null;
  let reversedGoal: ReversedGoal | null = null;
  let ball2: Ball2 | null = null;
  let goalkeeper2: Goalkeeper2 | null = null;
  let goalkeeper: Goalkeeper | null = null;
  let scoreDisplay: ScoreDisplay | null = null;
  let ballCountDisplay: BallCountDisplay | null = null;

  // Show start screen to choose mode before spawning balls
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let startScreenVisible = true;
  const startScreen = new StartScreen();
  addToLayer(container, startScreen, Layer.BALL);
  // Disable DOM reset button while start screen is visible
  try {
    const rb = document.getElementById('reset-btn') as HTMLButtonElement | null;
    if (rb) rb.disabled = true;
  } catch (e) {}
  startScreen.onSelect = (mode: 'play' | 'other') => {
    try { container.removeChild(startScreen); } catch (e) {}
    startScreenVisible = false;
    try { const hb = document.getElementById('home-btn') as HTMLButtonElement | null; if (hb) hb.disabled = false; } catch (e) {}
    if (mode === 'play') {
      // Begin normal gameplay: create UI on demand
      try {
        if (!ground) { ground = new Ground(); addToLayer(container, ground, Layer.GROUND); }
        if (!goal) {
          goal = new Goal();
          addToLayer(container, goal, Layer.NET);
          goalFrontLayer = goal.getFrontLayer();
          addToLayer(container, goalFrontLayer, Layer.GOAL_FRONT);
        }
        if (!goalkeeper) { goalkeeper = new Goalkeeper(); try { goalkeeper.setGoal(goal); } catch (e) {} addToLayer(container, goalkeeper, Layer.GOAL_FRONT); }
        if (!scoreDisplay) { scoreDisplay = new ScoreDisplay(); addToLayer(container, scoreDisplay, Layer.GOAL_FRONT); }
        if (!ballCountDisplay) { ballCountDisplay = new BallCountDisplay(); addToLayer(container, ballCountDisplay, Layer.GOAL_FRONT); try { ballCountDisplay.setGoal(goal); } catch(e) {} }
      } catch (e) {}

      // Ensure ball count UI shows initial count
      try { ballCountDisplay?.setCount(Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0))); } catch (e) {}

      // Hide Other-mode visuals if present
      try { if (reversedGoal) reversedGoal.visible = false; } catch (e) {}
      try { if (ball2) ball2.visible = false; } catch (e) {}
      try { if (goalkeeper2) goalkeeper2.visible = false; } catch (e) {}

      // Re-enable DOM reset button when entering Play mode
      try {
        const rb = document.getElementById('reset-btn') as HTMLButtonElement | null;
        if (rb) rb.disabled = false;
      } catch (e) {}

      // Create first ball
      createNewBall();
    } else {
      // Other mode: create Other-mode visuals on demand and remove gameplay UI
      try { removeAllBalls(); } catch (e) {}
      try { if (goalkeeper && container.children.includes(goalkeeper)) container.removeChild(goalkeeper); } catch (e) {}
      try { if (scoreDisplay && container.children.includes(scoreDisplay)) container.removeChild(scoreDisplay); } catch (e) {}
      try { if (ballCountDisplay && container.children.includes(ballCountDisplay)) container.removeChild(ballCountDisplay); } catch (e) {}
      try { if (goalFrontLayer && container.children.includes(goalFrontLayer)) container.removeChild(goalFrontLayer); } catch (e) {}
      try { if (goal && container.children.includes(goal)) container.removeChild(goal); } catch (e) {}
      // Remove original ground/background so only the new background remains
      try { if (ground && container.children.includes(ground)) container.removeChild(ground); } catch (e) {}

      // Create reversed goal background if needed
      try {
        if (!reversedGoal) reversedGoal = new ReversedGoal();
        addToLayer(container, reversedGoal, Layer.GROUND);
        const frameSprite = (reversedGoal as any).detachFrameSprite?.();
        if (frameSprite) {
          const frameContainer = new Container();
          frameContainer.addChild(frameSprite);
          addToLayer(container, frameContainer, Layer.OVERLAY);
        }
        (reversedGoal as any).refresh?.();
        reversedGoal.visible = true;
      } catch (e) {}

      // Create Ball2 and Goalkeeper2 for Other mode
      try {
        if (!ball2) ball2 = new Ball2();
        if (!goalkeeper2) goalkeeper2 = new Goalkeeper2();
        addToLayer(container, ball2, Layer.BALL);
        (ball2 as any).refresh?.();
        ball2.visible = true;
        try { (ball2 as any).keeper = goalkeeper2; } catch (e) {}
        addToLayer(container, goalkeeper2, Layer.GOAL_FRONT);
        (goalkeeper2 as any).refresh?.();
        goalkeeper2.visible = true;
      } catch (e) {}

      // Ensure Home button exists and enabled now that start screen is gone
      try { ensureHomeButton(); } catch (e) {}

      // Remove reset button DOM and unregister keyboard handler
      try {
        const rb = document.getElementById('reset-btn');
        if (rb) rb.remove();
      } catch (e) {}
      try {
        if (keydownHandler) document.removeEventListener('keydown', keydownHandler as any);
      } catch (e) {}

      // Stop gameplay spawns
      gameState.gameOver = true;
    }
    ;
  };

  // Home button and navigation helper: return to StartScreen and clear UI
  function goHome() {
    try { startScreenVisible = true; } catch (e) {}
    try { if (nextBallTimer) { clearTimeout(nextBallTimer); nextBallTimer = null; } } catch (e) {}
    // Remove all stage children to reset UI, then re-add start screen
    try { container.removeChildren(); } catch (e) {}
    try { gameState.gameOver = true; gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS; } catch (e) {}
    try { currentBall = null; } catch (e) {}
    try { addToLayer(container, startScreen, Layer.BALL); } catch (e) {}
    // Disable home and reset while on start screen
    try { const hb = document.getElementById('home-btn') as HTMLButtonElement | null; if (hb) hb.disabled = true; } catch (e) {}
    try { const rb = document.getElementById('reset-btn') as HTMLButtonElement | null; if (rb) rb.disabled = true; } catch (e) {}
  }

  function ensureHomeButton() {
    const id = 'home-btn';
    let hb = document.getElementById(id) as HTMLButtonElement | null;
    if (!hb) {
      hb = document.createElement('button');
      hb.id = id;
      hb.textContent = 'Home';
      hb.style.position = 'fixed';
      hb.style.left = '12px';
      hb.style.top = '12px';
      hb.style.zIndex = '10000';
      hb.style.pointerEvents = 'auto';
      hb.style.cursor = 'pointer';
      hb.style.padding = '8px 12px';
      hb.style.fontSize = '14px';
      document.body.appendChild(hb);
      hb.addEventListener('click', () => goHome());
    }
    try { hb.disabled = !!startScreenVisible; } catch (e) {}
  }

  // Ensure Home button exists and is initialized
  try { ensureHomeButton(); } catch (e) {}

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
    try { ballCountDisplay?.setCount(visual); } catch (e) {}
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
      try { scoreDisplay?.addGoal?.(); } catch (e) {}
      // Schedule reset and next ball after delay
      scheduleNextBallIfNeeded();
      // You can add score tracking, visual effects, or other game logic here
    };
    
    // Set callback for when goalkeeper saves
    currentBall.saveCallback = () => {
      try { scoreDisplay?.addSave?.(); } catch (e) {}
      // Schedule reset and next ball after delay
      scheduleNextBallIfNeeded();
    };

    // Set callback for outbound/insufficient power shots
    currentBall.outCallback = () => {
      try { scoreDisplay?.addOut?.(); } catch (e) {}
      // Schedule next ball now (match goal/save behavior) so spawn timing matches other outcomes
      scheduleNextBallIfNeeded();
    };
    
    addToLayer(container, currentBall, Layer.BALL);

    // Update visual ball count when a new ball is spawned
    const visualNow = Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0));
    try { ballCountDisplay?.setCount(visualNow); } catch (e) {}
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
    goalkeeper?.reset();
    
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
    try { ballCountDisplay?.setCount(visual); } catch (e) {}
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
      goalkeeper?.reset();

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

    const stats = scoreDisplay?.getStats?.() ?? { goals: 0, saves: 0, outs: 0, shots: 0, accuracy: 0 };
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
        try { scoreDisplay?.reset?.(); } catch (e) {}
        gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS;
        gameState.gameOver = false;
        // Update ball count display
        try { ballCountDisplay?.setCount(Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0))); } catch (e) {}
        createNewBall();
      });
    }
  }
  
  // Add reset button event listener
  const resetButton = document.getElementById('reset-btn');
  if (resetButton) {
    resetButton.addEventListener('click', resetBall);
  }
  
  // Add keyboard event listener for Z key (removable)
  keydownHandler = (event: KeyboardEvent) => {
    if (typeof startScreenVisible !== 'undefined' && startScreenVisible) return;
    if ((event.key || '').toLowerCase() === ' ') {
      resetBall();
    }
  };
  document.addEventListener('keydown', keydownHandler as any);
  
  // Note: initial ball will be created when StartScreen selection triggers it
})();