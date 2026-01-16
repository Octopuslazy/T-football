import * as PIXI from 'pixi.js';

export default class ScoreDisplay2 extends PIXI.Container {
	private scoreText: PIXI.Text;
	private goalsScored: number = 0;
	private ballsUsed: number = 0;
	private outs: number = 0;
	private goalkeeperSaves: number = 0;
	private _onResize: () => void;
	private _worldAttached: boolean = false;

	constructor(worldAttached: boolean = false) {
		super();
		this._worldAttached = !!worldAttached;

		this.scoreText = new PIXI.Text(this.getScoreText(), {
			fontFamily: 'Arial',
			fontSize: 28,
			fill: 0xFFFFFF,
			fontWeight: 'bold',
			stroke: 0x000000,
			strokeThickness: 3
		} as any);

		this.scoreText.anchor.set(0, 0);
		this.addChild(this.scoreText);

		this._onResize = this.updatePosition.bind(this);
		window.addEventListener('resize', this._onResize);
		this.updatePosition();
	}

	private updatePosition() {
		if (this._worldAttached) return; // world-attached displays are positioned in world coords by the caller
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		// place at top-left with some margin
		this.x = screenWidth/3.3;
		this.y = screenHeight/5;

		// neutralize ancestor scaling so text stays constant on screen
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

	private getScoreText(): string {
		return `Goals: ${this.goalsScored}  Saveds: ${this.goalkeeperSaves}  Shots: ${this.ballsUsed}`;
	}

	public addGoal() {
		this.goalsScored++;
		this.ballsUsed++;
		this.updateDisplay();
	}

	public addSave() {
		this.goalkeeperSaves++;
		this.ballsUsed++;
		this.updateDisplay();
	}

	public addOut() {
		this.outs++;
		this.ballsUsed++;
		this.updateDisplay();
	}

	public reset() {
		this.goalsScored = 0;
		this.goalkeeperSaves = 0;
		this.ballsUsed = 0;
		this.outs = 0;
		this.updateDisplay();
	}

	private updateDisplay() {
		this.scoreText.text = this.getScoreText();
	}

	public getStats() {
		return {
			goals: this.goalsScored,
			saves: this.goalkeeperSaves,
			outs: this.outs,
			shots: this.ballsUsed,
			accuracy: this.ballsUsed > 0 ? (this.goalsScored / this.ballsUsed * 100).toFixed(1) : '0.0'
		};
	}

	destroy(options?: any) {
		window.removeEventListener('resize', this._onResize);
		super.destroy(options);
	}
}


