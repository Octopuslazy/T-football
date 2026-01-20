import { Application, Assets, Container } from 'pixi.js';
import * as PIXI from 'pixi.js';
import Goal from './UI/goal.js';
import Ball from './UI/ball.js';
import Ground from './UI/ground.js';
import Goalkeeper from './UI/goalkeeper.js';
import ScoreDisplay from './UI/scoreDisplay.js';
import BallCountDisplay from './UI/ballCountDisplay.js';
import BallCountDisplay2 from './UI-2/ballCountDisplay2.js';
import StartScreen from './UI/startScreen.js';
import ReversedGoal from './UI-2/goal.js';
import Ball2 from './UI-2/ball2.js';
import Goalkeeper2 from './UI-2/goalkeeper2.js';
import ScoreDisplay2 from './UI-2/scoreDisplay2.js';
import { GAME_CONFIG, BASE_HEIGHT, BASE_WIDTH } from './constant/global.js';
import { Layer, addToLayer } from './ControllUI/layers.js';
import SoundController from './ControllUI/SoundController.js';

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

  // Apply portrait-oriented uniform scaling to the game container so UI
  // elements maintain consistent relative sizes across mobile devices.
  const applyPortraitScale = () => {
    try {
      // Use base design resolution from constants
      const w = BASE_WIDTH;
      const h = BASE_HEIGHT;
      const sw = window.innerWidth / w;
      const sh = window.innerHeight / h;
      // Choose scale to fit inside window while preserving aspect ratio
      const scale = Math.min(sw, sh);

      // Apply uniform scale to the main game container (world). Overlays
      // like StartScreen are added to `app.stage` and are not affected.
      container.scale.set(scale, scale);

      // Center the container within the viewport (letterbox on sides or top/bottom)
      const dispW = w * scale;
      const dispH = h * scale;
      container.x = Math.round((window.innerWidth - dispW) / 2);
      container.y = Math.round((window.innerHeight - dispH) / 2);

      // Ensure pivot remains at (0,0) unless other code changes it intentionally
      try { container.pivot.set(0, 0); } catch (e) {}
    } catch (e) {}
  };

  // Call initially and on window resize so layout remains consistent
  applyPortraitScale();
  window.addEventListener('resize', () => applyPortraitScale());

  // Load assets
  try {
    await Assets.load(['./arts/goal.png', './arts/ball.png', './arts/net.png', './arts/gkeeper.png', './arts/gkeeper2.png', './arts/goal2.png', './arts/bg2.png', './arts/goal3.png', './arts/startscreen.png', './sound/game-loop.mp3', './sound/click.mp3']);
  }
  catch (e) {
    // ignore load errors here; components will listen for texture update
  }

  // Defer creation of major UI until user selects mode on the StartScreen.
  let ground: Ground | null = null;
  let goal: Goal | null = null;
  let goalFrontLayer: any = null;
  let reversedGoal: ReversedGoal | null = null;
  let frameSprite: PIXI.Sprite | null = null;
  let ball2: Ball2 | null = null;
  let goalkeeper2: Goalkeeper2 | null = null;
  let goalkeeper: Goalkeeper | null = null;
  let scoreDisplay: ScoreDisplay | null = null;
  let scoreDisplay2: ScoreDisplay2 | null = null;
  let ballCountDisplay: BallCountDisplay | null = null;
  let ballCountDisplay2: BallCountDisplay2 | null = null;

  // Show start screen to choose mode before spawning balls
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let startScreenVisible = true;
  let cameraLoopId: number | null = null;
  let inputBlocker: PIXI.Graphics | null = null;
  let inputLocked = false;
  const startScreen = new StartScreen();
   let shotTimeoutId: any = null;
  

  // Keeper auto-shoot helpers
  function stopKeeperAutoShoot() {
    try { if (shotTimeoutId) { clearTimeout(shotTimeoutId); shotTimeoutId = null; } } catch (e) {}
    try { if (ball2) (ball2 as any).onShotComplete = undefined; } catch (e) {}
  }

  function startKeeperAutoShoot() {
    stopKeeperAutoShoot();
    try {
      if (!ball2 || !goalkeeper2) return;
      let shotCount = 0;
      const maxShots = 5;

      const scheduleNext = () => {
        try {
          if (shotCount >= maxShots) {
            // when finished, show keeper-specific results popup after a short delay
            shotTimeoutId = setTimeout(() => {
              try { showKeeperEndPopup(); } catch (e) {}
              shotTimeoutId = null;
            }, 800);
            return;
          }
          try { (ball2 as any).refresh?.(); } catch (e) {}
          shotCount++;
          // decrement global remaining balls and update keeper-mode display
          try { gameState.ballsRemaining = Math.max(0, (gameState.ballsRemaining || 0) - 1); } catch (e) {}
          try { if (ballCountDisplay2) ballCountDisplay2.setCount(Math.max(0, gameState.ballsRemaining)); } catch (e) {}
          try { (ball2 as any).shoot?.(); } catch (e) {}
        } catch (e) {}
      };

      try { (ball2 as any).onShotComplete = () => { shotTimeoutId = setTimeout(() => scheduleNext(), 1000); }; } catch (e) {}
      scheduleNext();
    } catch (e) {}
  }

  
  // Start screen should be an overlay on the stage so it is not affected
  // by world/container transforms (scale/pivot). Add it to `app.stage`.
  addToLayer(app.stage, startScreen, Layer.OVERLAY);
  // Disable DOM reset button while start screen is visible
  try {
    const rb = document.getElementById('reset-btn') as HTMLButtonElement | null;
    if (rb) rb.disabled = true;
  } catch (e) {}

      
  startScreen.onSelect = (mode: 'play' | 'other') => {
    try { app.stage.removeChild(startScreen); } catch (e) {}
    startScreenVisible = false;
      // Start background music on first user selection (satisfies autoplay gesture)
      try { SoundController.playLoop?.(); } catch (e) {}
    try { ensureHomeButton(); } catch (e) {}
    if (mode === 'play') {
      // Begin normal gameplay: create UI on demand
      try {
        // Ensure container transforms are reset and portrait scaling is applied
        // (fixes cases where previous camera/pivot changes left the world mis-scaled)
        try { container.pivot.set(0, 0); } catch (e) {}
        try { container.position.set(0, 0); } catch (e) {}
        try { container.scale.set(1, 1); } catch (e) {}
        try { applyPortraitScale(); } catch (e) {}
        if (!ground) {
          ground = new Ground();
          addToLayer(container, ground, Layer.GROUND);
        } else if (!container.children.includes(ground)) {
          addToLayer(container, ground, Layer.GROUND);
        }

        if (!goal) {
          goal = new Goal();
          try { goal.setCircleAlpha?.(0.22); } catch (e) {}
          try { goal.setGridVisible?.(false); } catch (e) {}
          addToLayer(container, goal, Layer.NET);
          goalFrontLayer = goal.getFrontLayer();
          addToLayer(container, goalFrontLayer, Layer.GOAL_FRONT);
        } else {
          if (!container.children.includes(goal)) addToLayer(container, goal, Layer.NET);
          if (!goalFrontLayer) {
            goalFrontLayer = goal.getFrontLayer();
            addToLayer(container, goalFrontLayer, Layer.GOAL_FRONT);
          } else if (!container.children.includes(goalFrontLayer)) {
            addToLayer(container, goalFrontLayer, Layer.GOAL_FRONT);
          }
        }

        if (!goalkeeper) {
          goalkeeper = new Goalkeeper();
          try { goalkeeper.setGoal(goal); } catch (e) {}
          addToLayer(container, goalkeeper, Layer.GOAL_FRONT);
        } else if (!container.children.includes(goalkeeper)) {
          try { goalkeeper.setGoal(goal); } catch (e) {}
          addToLayer(container, goalkeeper, Layer.GOAL_FRONT);
        }

        if (!scoreDisplay) {
          scoreDisplay = new ScoreDisplay();
          addToLayer(container, scoreDisplay, Layer.GOAL_FRONT);
        } else if (!container.children.includes(scoreDisplay)) {
          addToLayer(container, scoreDisplay, Layer.GOAL_FRONT);
        }

        if (!ballCountDisplay) {
          ballCountDisplay = new BallCountDisplay();
          addToLayer(container, ballCountDisplay, Layer.GOAL_FRONT);
          try { ballCountDisplay.setGoal(goal); } catch(e) {}
        } else if (!container.children.includes(ballCountDisplay)) {
          addToLayer(container, ballCountDisplay, Layer.GOAL_FRONT);
          try { ballCountDisplay.setGoal(goal); } catch(e) {}
        }
      } catch (e) {}

      // Ensure ball count UI shows initial count
      try { ballCountDisplay?.setCount(Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0))); } catch (e) {}

      // Reset scores when entering Play mode (start fresh for a new session)
      try { scoreDisplay?.reset?.(); } catch (e) {}
      try { gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS; } catch (e) {}

      // Hide Other-mode visuals if present
      try { if (reversedGoal) reversedGoal.visible = false; } catch (e) {}
      try { if (ball2) ball2.visible = false; } catch (e) {}
      try { if (goalkeeper2) goalkeeper2.visible = false; } catch (e) {}
      try { if (scoreDisplay2) scoreDisplay2.visible = false; } catch (e) {}

      // Re-enable DOM reset button when entering Play mode
      try {
        const rb = document.getElementById('reset-btn') as HTMLButtonElement | null;
        if (rb) rb.disabled = false;
      } catch (e) {}

      // Ensure game state allows spawning and create first ball
      try { gameState.gameOver = false; } catch (e) {}
      try { if (gameState.ballsRemaining <= 0) gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS; } catch (e) {}
      // Reset goalkeeper to ensure it's ready
      try { goalkeeper?.reset(); } catch (e) {}
      // Create first ball
      createNewBall();
    } else {
      // Other mode: create Other-mode visuals on demand and remove gameplay UI
      // initialize keeper-mode remaining balls
      try { gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS; } catch (e) {}
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
        try { (reversedGoal as any).setCircleAlpha?.(0); } catch (e) {}
        try { (reversedGoal as any).setGridVisible?.(false); } catch (e) {}
        addToLayer(container, reversedGoal, Layer.GROUND);
        frameSprite = (reversedGoal as any).detachFrameSprite?.() ?? null;
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
        // If we detached a frame sprite earlier, tell goalkeeper2 so it can size itself
        try { if (frameSprite && (goalkeeper2 as any).setFrameSprite) (goalkeeper2 as any).setFrameSprite(frameSprite); } catch (e) {}
        // create and show ScoreDisplay2 for goalkeeper mode
        try {
          if (!scoreDisplay2) {
            scoreDisplay2 = new ScoreDisplay2();
            addToLayer(app.stage, scoreDisplay2, Layer.OVERLAY);
          } else if (!app.stage.children.includes(scoreDisplay2)) {
            addToLayer(app.stage, scoreDisplay2, Layer.OVERLAY);
          }
          // keep score display hidden until zoom+pivot finishes for cinematic effect
          scoreDisplay2.visible = false;
          // Wire ball2 callbacks to update keeper scores
          try { (ball2 as any).onGoal = () => { try { scoreDisplay2?.addGoal(); } catch (e) {} }; } catch (e) {}
          try { (ball2 as any).onSave = () => { try { scoreDisplay2?.addSave(); } catch (e) {} }; } catch (e) {}
        } catch (e) {}
      } catch (e) {}

      // Ensure Home button exists and enabled now that start screen is gone
      try { ensureHomeButton(); } catch (e) {}
      // For goalkeeper mode, keep Home disabled/hidden until zoom completes
      try {
        const hb = document.getElementById('home-btn') as HTMLButtonElement | null;
        if (hb) { hb.disabled = true; hb.style.display = 'none'; }
      } catch (e) {}
      // block all player input while zooming setup is pending
      try {
        inputLocked = true;
        if (!inputBlocker) {
          inputBlocker = new PIXI.Graphics();
          inputBlocker.beginFill(0x000000, 0);
          inputBlocker.drawRect(0, 0, window.innerWidth, window.innerHeight);
          inputBlocker.endFill();
          inputBlocker.interactive = true;
          (inputBlocker as any).hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
          inputBlocker.on('pointerdown', (e: any) => { try { e.stopPropagation?.(); } catch (e) {} });
          addToLayer(container, inputBlocker, Layer.OVERLAY);
        }
      } catch (e) {}

          // Camera zoom+follow: after 3s, zoom over 2s then start following goalkeeper2 with lerp
          try {
            if (goalkeeper2) {
              const zoomDelay = 1000;
              const zoomDuration = 2000;
              // Use a small relative multiplier so zoom is relative to current portrait scale
              const zoomMultiplier = 1.3; // ~15% zoom above current scale
              const targetScale = (container.scale.x || 1) * zoomMultiplier;
              setTimeout(() => {
                // tween container.scale.x/y from current to targetScale over zoomDuration
                const start = performance.now();
                const startScale = container.scale.x || 1;
                const animateZoom = (now: number) => {
                  const t = Math.min(1, (now - start) / zoomDuration);
                  const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                  const s = startScale + (targetScale - startScale) * ease;
                  container.scale.set(s, s);
                  if (t < 1) requestAnimationFrame(animateZoom);
                  else {
                    // start follow ticker
                    let followTicker: (now: number) => void = (_now: number) => {};
                    try {
                      const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
                      let last = performance.now();
                      const tickerFn = (now: number) => {
                        // compute desired root pivot based on goalkeeper2 world position
                        try {
                          const keeper = goalkeeper2 as any;
                          const keeperWorldX = keeper.x;
                          const keeperWorldY = keeper.y;
                          // target pivot to center on keeper
                          const targetPivotX = keeperWorldX;
                          const targetPivotY = keeperWorldY;
                          // lerp current pivot toward target (0.1 factor)
                          const curPivotX = container.pivot.x || 0;
                          const curPivotY = container.pivot.y || 0;
                          const npX = lerp(curPivotX, targetPivotX, 0.1);
                          const npY = lerp(curPivotY, targetPivotY, 0.1);
                          container.pivot.set(npX, npY);
                          // clamp to bounds: ensure we don't show outside the play field (approx)
                          // compute world extents roughly from stage size and scale
                          const worldW = window.innerWidth / container.scale.x;
                          const worldH = window.innerHeight / container.scale.y;
                          const halfW = worldW / 2;
                          const halfH = worldH / 2;
                          // clamp pivot within [halfW, groundWidth-halfW] etc. For now, minimal clamp to non-negative
                          const clampedX = Math.max(0, Math.min(npX, 20000));
                          const clampedY = Math.max(0, Math.min(npY, 20000));
                          container.pivot.set(clampedX, clampedY);
                        } catch (e) {}
                      };
                                  // Camera follow disabled (temporarily commented out)
                                  // register to rAF loop and keep id so we can cancel when returning Home
                                  // const loop = (now: number) => { tickerFn(now); cameraLoopId = requestAnimationFrame(loop); };
                                  // cameraLoopId = requestAnimationFrame(loop);
                                  // followTicker = tickerFn;
                                  // Re-enable Home button now that zoom+follow setup finished
                                  try { const hb = document.getElementById('home-btn') as HTMLButtonElement | null; if (hb) { hb.disabled = false; hb.style.display = startScreenVisible ? 'none' : 'block'; } } catch (e) {}
                                  // Show score display now that zoom+pivot finished
                                  try {
                                    if (!scoreDisplay2) {
                                      scoreDisplay2 = new ScoreDisplay2();
                                      addToLayer(app.stage, scoreDisplay2, Layer.OVERLAY);
                                    } else if (!app.stage.children.includes(scoreDisplay2)) {
                                      addToLayer(app.stage, scoreDisplay2, Layer.OVERLAY);
                                    }
                                    // place the score display in overlay (screen) coords near the Home button
                                    try {
                                      scoreDisplay2.visible = true;
                                      try { scoreDisplay2.refreshPosition?.(); } catch (e) {}
                                    } catch (e) {}
                                      // Create keeper-mode ball count display (overlay) and set initial count
                                    try {
                                      if (!ballCountDisplay2) {
                                        ballCountDisplay2 = new BallCountDisplay2();
                                        addToLayer(app.stage, ballCountDisplay2, Layer.OVERLAY);
                                      } else if (!app.stage.children.includes(ballCountDisplay2)) {
                                        addToLayer(app.stage, ballCountDisplay2, Layer.OVERLAY);
                                      }
                                      ballCountDisplay2.visible = true;
                                      // Do not bind to world `goal` here (positions are overlay/screen-based).
                                      try { /* ballCountDisplay2.setGoal?.(reversedGoal); */ } catch (e) {}
                                      try { console.log('[UI] ballCountDisplay2 created, count=', gameState.ballsRemaining, 'visible=', !!ballCountDisplay2.visible); } catch (e) {}
                                      } catch (e) {}
                                      // Position ballCountDisplay2 below scoreDisplay2 (overlay coordinates)
                                      try {
                                        if (scoreDisplay2 && ballCountDisplay2) {
                                          try { scoreDisplay2.refreshPosition?.(); } catch (e) {}
                                          const sdBounds = scoreDisplay2.getBounds();
                                          // place ballCountDisplay2 under scoreDisplay2 with small gap
                                          ballCountDisplay2.x = scoreDisplay2.x;
                                          ballCountDisplay2.y = scoreDisplay2.y + sdBounds.height + 8;
                                          try { ballCountDisplay2.setCount(Math.max(0, gameState.ballsRemaining)); } catch (e) {}
                                          try { const b = ballCountDisplay2.getBounds(); console.log('[UI] ballCountDisplay2 bounds after position', b); } catch (e) {}
                                        }
                                      } catch (e) {}
                                  } catch (e) {}
                                  // remove input blocker and unlock input
                                  try {
                                    if (inputBlocker) { try { container.removeChild(inputBlocker); } catch (e) {} ; try { inputBlocker.destroy(); } catch (e) {} inputBlocker = null; }
                                  } catch (e) {}
                                  try { inputLocked = false; } catch (e) {}
                                  // Start keeper auto-shoot chain now that zoom+follow began
                                  try { startKeeperAutoShoot(); } catch (e) {}
                    } catch (e) {}
                  }
                };
                // BEFORE starting the zoom, set pivot to goalkeeper local coords but keep the keeper's
                // current screen position so the keeper does not get centered — scaling will occur around that fixed screen point.
                try {
                  if (goalkeeper2) {
                    const keeper = goalkeeper2 as any;
                    const kx = keeper.x || 0;
                    const ky = keeper.y || 0;
                    // compute keeper's current screen position: screen = position + (local - pivot) * scale
                    const curScaleX = container.scale.x || 1;
                    const curScaleY = container.scale.y || curScaleX;
                    const oldScreenX = (container.position.x || 0) + (kx - (container.pivot.x || 0)) * curScaleX;
                    const oldScreenY = (container.position.y || 0) + (ky - (container.pivot.y || 0)) * curScaleY;
                    // set pivot to keeper local coords
                    container.pivot.set(kx, ky);
                    // set position so keeper remains at same screen coords
                    container.position.set(oldScreenX, oldScreenY);
                  }
                } catch (e) {}
                // Disable Home button while zooming
                try { const hb = document.getElementById('home-btn') as HTMLButtonElement | null; if (hb) { hb.disabled = true; } } catch (e) {}
                requestAnimationFrame(animateZoom);
              }, zoomDelay);
            }
          } catch (e) {}

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
    try { addToLayer(app.stage, startScreen, Layer.OVERLAY); } catch (e) {}
    // Cancel camera follow loop (if running) and reset transforms
    try { if (cameraLoopId != null) { cancelAnimationFrame(cameraLoopId); cameraLoopId = null; } } catch (e) {}
    try { container.scale.set(1, 1); } catch (e) {}
    try { container.pivot.set(0, 0); } catch (e) {}
    try { container.position.set(0, 0); } catch (e) {}
    try { applyPortraitScale(); } catch (e) {}
    try { stopKeeperAutoShoot(); } catch (e) {}
    // reset and destroy keeper-mode score display so re-entering creates a fresh instance
    try { if (scoreDisplay2) { try { scoreDisplay2.destroy(); } catch (e) {} scoreDisplay2 = null; } } catch (e) {}
    // reset and destroy keeper-mode ball count overlay
    try { if (ballCountDisplay2) { try { if (app.stage && app.stage.children.includes(ballCountDisplay2)) app.stage.removeChild(ballCountDisplay2); } catch (e) {} try { ballCountDisplay2.destroy(); } catch (e) {} ballCountDisplay2 = null; } } catch (e) {}
    // Hide home and reset while on start screen
    try { const hb = document.getElementById('home-btn') as HTMLButtonElement | null; if (hb) { hb.disabled = true; hb.style.display = 'none'; } } catch (e) {}
    try { const rb = document.getElementById('reset-btn') as HTMLButtonElement | null; if (rb) rb.disabled = true; } catch (e) {}
    // Clear any pending shot scheduling timeouts
    try { if (shotTimeoutId) { clearTimeout(shotTimeoutId); shotTimeoutId = null; } } catch (e) {}
    
  }

  function ensureHomeButton() {
    const id = 'home-btn';
    let hb = document.getElementById(id) as HTMLButtonElement | null;
    if (!hb) {
      hb = document.createElement('button');
      hb.id = id;
      hb.textContent = 'Home';
      hb.style.position = 'fixed';
      // place button at top-right
      hb.style.right = '8px';
      hb.style.top = '8px';
      hb.style.zIndex = '10000';
      hb.style.pointerEvents = 'auto';
      hb.style.cursor = 'pointer';
      // Compact mobile-friendly style
      hb.style.padding = '8px 12px';
      hb.style.fontSize = '14px';
      hb.style.borderRadius = '6px';
      hb.style.minWidth = '40px';
      hb.style.background = '#ffffff';
      hb.style.color = '#333333';
      hb.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      document.body.appendChild(hb);
      hb.addEventListener('click', () => { try { SoundController.playSfx?.(); } catch (e) {} ; goHome(); });
    }
    try { hb.disabled = !!startScreenVisible; hb.style.display = startScreenVisible ? 'none' : 'block'; } catch (e) {}
  }

  // Ensure Home button exists and is initialized
  try { ensureHomeButton(); } catch (e) {}

  // Debug: periodically log current world scale and pivot to help diagnose zoom
  try {
    const key = '__zoomLoggerInterval';
    if (!(window as any)[key]) {
      (window as any)[key] = setInterval(() => {
        try {
          
          
        } catch (e) {}
      }, 5000);
    }
  } catch (e) {}

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
    // Create dim overlay to block input behind popup
    try {
      const prevOv = document.getElementById('popup-overlay');
      if (prevOv) prevOv.remove();
      const ov = document.createElement('div');
      ov.id = 'popup-overlay';
      ov.style.position = 'fixed';
      ov.style.left = '0';
      ov.style.top = '0';
      ov.style.width = '100%';
      ov.style.height = '100%';
      ov.style.background = 'rgba(0,0,0,0.45)';
      ov.style.zIndex = '10001';
      ov.style.pointerEvents = 'auto';
      document.body.appendChild(ov);
    } catch (e) {}

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
    popup.style.zIndex = '10002';
    // Responsive sizing for portrait mobile: use viewport width and remove fixed scale
    popup.style.transform = 'translate(-50%, -50%) scale(1)';
    popup.style.boxSizing = 'border-box';
    popup.style.width = 'min(360px, 90vw)';
    popup.style.padding = '24px';
    

    const stats = scoreDisplay2?.getStats?.() ?? scoreDisplay?.getStats?.() ?? { goals: 0, saves: 0, outs: 0, shots: 0, accuracy: 0 };
    popup.innerHTML = `<div style="text-align:center;"><h2 style=\"margin:0 0 12px 0;\">Game End</h2>
      <p style=\"margin:8px 0;\">Goals: ${stats.goals} &nbsp; Saves: ${stats.saves} &nbsp; Outs: ${stats.outs}&nbsp; Shots: ${stats.shots}</p>
      <p style=\"margin:8px 0;\">Accuracy: ${stats.accuracy}%</p>
      <button id=\"game-end-restart\" style=\"margin-top:12px;padding:10px 18px;font-size:16px;border-radius:6px;\">Play Again</button>
      <button id=\"game-end-home\" style=\"margin-top:12px;margin-left:8px;padding:10px 18px;font-size:16px;border-radius:6px;\">Home</button>
    </div>`;

    document.body.appendChild(popup);

    const btn = document.getElementById('game-end-restart');
    if (btn) {
      btn.addEventListener('click', () => {
        try { SoundController.playSfx?.(); } catch (e) {}
        try { popup.remove(); } catch (e) {}
        try { const ov = document.getElementById('popup-overlay'); if (ov) ov.remove(); } catch (e) {}
        // Reset scores and state
        try { scoreDisplay?.reset?.(); } catch (e) {}
        gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS;
        gameState.gameOver = false;
        // Update ball count display
        try { ballCountDisplay?.setCount(Math.max(0, gameState.ballsRemaining - (currentBall ? 1 : 0))); } catch (e) {}
        // Also reset keeper overlay counter if present
        try { if (ballCountDisplay2) ballCountDisplay2.setCount(Math.max(0, GAME_CONFIG.MAX_BALLS)); } catch (e) {}
        createNewBall();
      });
    }
    const hb = document.getElementById('game-end-home');
    if (hb) {
      hb.addEventListener('click', () => {
        try { SoundController.playSfx?.(); } catch (e) {}
        try { popup.remove(); } catch (e) {}
        try { const ov = document.getElementById('popup-overlay'); if (ov) ov.remove(); } catch (e) {}
        try { goHome(); } catch (e) {}
      });
    }
  }

  function showKeeperEndPopup() {
    try { stopKeeperAutoShoot(); } catch (e) {}
    try {
      const prevOv = document.getElementById('popup-overlay');
      if (prevOv) prevOv.remove();
      const ov = document.createElement('div');
      ov.id = 'popup-overlay';
      ov.style.position = 'fixed';
      ov.style.left = '0';
      ov.style.top = '0';
      ov.style.width = '100%';
      ov.style.height = '100%';
      ov.style.background = 'rgba(0,0,0,0.45)';
      ov.style.zIndex = '10001';
      ov.style.pointerEvents = 'auto';
      document.body.appendChild(ov);
    } catch (e) {}

    const existing = document.getElementById('keeper-end-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'keeper-end-popup';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.padding = '48px';
    popup.style.background = 'rgba(0,0,0,0.85)';
    popup.style.color = 'white';
    popup.style.fontSize = '20px';
    popup.style.borderRadius = '12px';
      popup.style.zIndex = '10002';
      // Responsive sizing for portrait mobile: remove fixed scale and use viewport width
      popup.style.transform = 'translate(-50%, -50%) scale(1)';
      popup.style.boxSizing = 'border-box';
      popup.style.width = 'min(360px, 90vw)';
      popup.style.padding = '24px';

    const stats = scoreDisplay2?.getStats?.() ?? scoreDisplay?.getStats?.() ?? { goals: 0, saves: 0,  shots: 0, accuracy: 0 };
    popup.innerHTML = `<div style="text-align:center;">
      <h2 style=\"margin:0 0 12px 0;\">Keeper Mode</h2>
      <p style=\"margin:8px 0;\">Goals: ${stats.goals} &nbsp; Saves: ${stats.saves} &nbsp;  Shots: ${stats.shots}</p>
      <p style=\"margin:8px 0;\">Accuracy: ${stats.accuracy}%</p>
      <button id=\"keeper-playagain\" style=\"margin-top:12px;padding:10px 18px;font-size:16px;border-radius:6px;\">Play Again</button>
      <button id=\"keeper-home\" style=\"margin-top:12px;margin-left:8px;padding:10px 18px;font-size:16px;border-radius:6px;\">Home</button>
    </div>`;

    document.body.appendChild(popup);

    const btn = document.getElementById('keeper-playagain');
    if (btn) {
      btn.addEventListener('click', () => {
        try { SoundController.playSfx?.(); } catch (e) {}
        try { popup.remove(); } catch (e) {}
        try { const ov = document.getElementById('popup-overlay'); if (ov) ov.remove(); } catch (e) {}
        try { if (shotTimeoutId) { clearTimeout(shotTimeoutId); shotTimeoutId = null; } } catch (e) {}
        try { scoreDisplay2?.reset?.(); } catch (e) {}
        // Reset keeper shot count and UI before starting again
        try { gameState.ballsRemaining = GAME_CONFIG.MAX_BALLS; } catch (e) {}
        try { if (ballCountDisplay2) ballCountDisplay2.setCount(Math.max(0, gameState.ballsRemaining)); } catch (e) {}
        try { shotTimeoutId = setTimeout(() => { try { startKeeperAutoShoot(); } catch (e) {} ; shotTimeoutId = null; }, 2000); } catch (e) {}
      });
    }
    const hb = document.getElementById('keeper-home');
    if (hb) {
      hb.addEventListener('click', () => {
        try { SoundController.playSfx?.(); } catch (e) {}
        try { popup.remove(); } catch (e) {}
        try { const ov = document.getElementById('popup-overlay'); if (ov) ov.remove(); } catch (e) {}
        try { goHome(); } catch (e) {}
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
    if (inputLocked) return;
    if ((event.key || '').toLowerCase() === ' ') {
      resetBall();
    }
  };
  document.addEventListener('keydown', keydownHandler as any);
  
  // Note: initial ball will be created when StartScreen selection triggers it
})();