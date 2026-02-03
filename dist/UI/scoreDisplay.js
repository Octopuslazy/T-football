import * as PIXI from 'pixi.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../constant/global';
export default class ScoreDisplay extends PIXI.Container {
    constructor() {
        super();
        this.goalsScored = 0;
        this.ballsUsed = 0;
        this.outs = 0;
        this.goalkeepersaves = 0;
        // Create score text
        this.scoreText = new PIXI.Text(this.getScoreText(), {
            fontFamily: 'Arial',
            fontSize: 25,
            fill: 0xFFFFFF,
            fontWeight: 'bold',
            stroke: 0x000000,
            strokeThickness: 3
        });
        this.scoreText.anchor.set(0.5, 0); // Center-top anchor
        this.addChild(this.scoreText);
        this._onResize = this.updatePosition.bind(this);
        window.addEventListener('resize', this._onResize);
        // Initial position
        this.updatePosition();
    }
    // Update position based on screen size
    updatePosition() {
        const screenWidth = BASE_WIDTH;
        const screenHeight = BASE_HEIGHT;
        // Position at top center of design area (these coords are in design space)
        this.x = screenWidth / 2;
        this.y = screenHeight / 18; // ~9% from top
        // Neutralize ancestor scaling so score display stays constant relative to screen
        let ancestor = this.parent;
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
    getScoreText() {
        return `Goals: ${this.goalsScored} | Saves: ${this.goalkeepersaves} | Outs: ${this.outs} | Shots: ${this.ballsUsed}`;
    }
    // Add a goal
    addGoal() {
        this.goalsScored++;
        this.ballsUsed++;
        this.updateDisplay();
    }
    // Add a save
    addSave() {
        this.goalkeepersaves++;
        this.ballsUsed++;
        this.updateDisplay();
    }
    // Add a missed shot
    addMiss() {
        this.ballsUsed++;
        this.updateDisplay();
    }
    // Add an outbound / insufficient power shot
    addOut() {
        this.outs++;
        this.ballsUsed++;
        this.updateDisplay();
    }
    // Reset all scores
    reset() {
        this.goalsScored = 0;
        this.goalkeepersaves = 0;
        this.ballsUsed = 0;
        this.outs = 0;
        this.updateDisplay();
    }
    // Update the display
    updateDisplay() {
        this.scoreText.text = this.getScoreText();
    }
    // Get current stats
    getStats() {
        return {
            goals: this.goalsScored,
            saves: this.goalkeepersaves,
            outs: this.outs,
            shots: this.ballsUsed,
            accuracy: this.ballsUsed > 0 ? (this.goalsScored / this.ballsUsed * 100).toFixed(1) : '0.0'
        };
    }
    // Cleanup
    destroy(options) {
        window.removeEventListener('resize', this._onResize);
        super.destroy(options);
    }
}
