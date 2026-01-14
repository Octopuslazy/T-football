import * as PIXI from 'pixi.js';

export default class ScoreDisplay extends PIXI.Container {
  private scoreText: PIXI.Text;
  private goalsScored: number = 0;
  private ballsUsed: number = 0;
  private goalkeepersaves: number = 0;
  private _onResize: () => void;

  constructor() {
    super();
    
    // Create score text
    this.scoreText = new PIXI.Text(this.getScoreText(), {
      fontFamily: 'Arial',
      fontSize: 40,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
      stroke: 0x000000,
      strokeThickness: 3
    } as any);
    
    this.scoreText.anchor.set(0.5, 0); // Center-top anchor
    this.addChild(this.scoreText);
    
    this._onResize = this.updatePosition.bind(this);
    window.addEventListener('resize', this._onResize);
    
    // Initial position
    this.updatePosition();
  }
  
  // Update position based on screen size
  private updatePosition() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Position at top center of screen
    this.x = screenWidth / 2;
    this.y = 20; // 20px from top
    
    // Neutralize ancestor scaling so score display stays constant relative to screen
    let ancestor: any = this.parent;
    let accumulatedScale = 1;
    while (ancestor) {
      if (ancestor.scale) {
        const sx = typeof ancestor.scale.x === 'number' ? ancestor.scale.x : 1;
        accumulatedScale *= sx;
      }
      ancestor = ancestor.parent;
    }

    const inv = accumulatedScale && accumulatedScale !== 0 ? 1 / accumulatedScale : 1;
    this.scale.set(inv);
  }
  
  // Get formatted score text
  private getScoreText(): string {
    return `Goals: ${this.goalsScored} | Saves: ${this.goalkeepersaves} | Shots: ${this.ballsUsed}`;
  }
  
  // Add a goal
  public addGoal() {
    this.goalsScored++;
    this.ballsUsed++;
    this.updateDisplay();
  }
  
  // Add a save
  public addSave() {
    this.goalkeepersaves++;
    this.ballsUsed++;
    this.updateDisplay();
  }
  
  // Add a missed shot
  public addMiss() {
    this.ballsUsed++;
    this.updateDisplay();
  }
  
  // Reset all scores
  public reset() {
    this.goalsScored = 0;
    this.goalkeepersaves = 0;
    this.ballsUsed = 0;
    this.updateDisplay();
  }
  
  // Update the display
  private updateDisplay() {
    this.scoreText.text = this.getScoreText();
  }
  
  // Get current stats
  public getStats() {
    return {
      goals: this.goalsScored,
      saves: this.goalkeepersaves,
      shots: this.ballsUsed,
      accuracy: this.ballsUsed > 0 ? (this.goalsScored / this.ballsUsed * 100).toFixed(1) : '0.0'
    };
  }
  
  // Cleanup
  destroy(options?: any) {
    window.removeEventListener('resize', this._onResize);
    super.destroy(options);
  }
}