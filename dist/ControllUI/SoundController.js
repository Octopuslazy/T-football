export class SoundController {
    constructor() {
        this.audio = null;
        this._volume = 0.5;
    }
    // Initialize audio element (idempotent)
    init(src = './Assets/sound/game-loop.mp3') {
        try {
            if (this.audio)
                return;
            this.audio = new Audio(src);
            this.audio.loop = true;
            this.audio.preload = 'auto';
            this.audio.volume = this._volume;
            // Allow quick loading
            try {
                this.audio.load();
            }
            catch (e) { }
        }
        catch (e) { }
    }
    // Play the looping background audio (call from a user gesture)
    playLoop() {
        try {
            if (!this.audio)
                this.init();
            // play may be blocked by autoplay policies; ignore promise rejection
            this.audio?.play().catch(() => { });
        }
        catch (e) { }
    }
    pause() {
        try {
            this.audio?.pause();
        }
        catch (e) { }
    }
    setVolume(v) {
        this._volume = Math.max(0, Math.min(1, v));
        try {
            if (this.audio)
                this.audio.volume = this._volume;
        }
        catch (e) { }
    }
    toggleMute() {
        try {
            if (!this.audio)
                this.init();
            if (this.audio)
                this.audio.muted = !this.audio.muted;
        }
        catch (e) { }
    }
    // Play a one-shot sound effect. `src` can be a path to the sound file.
    playSfx(src = './Assets/sound/click.mp3') {
        try {
            const s = new Audio(src);
            s.preload = 'auto';
            s.volume = this._volume;
            s.play().catch(() => { });
        }
        catch (e) { }
    }
}
// export singleton
export const soundController = new SoundController();
export default soundController;
