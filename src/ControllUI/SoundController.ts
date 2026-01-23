export class SoundController {
  private audio: HTMLAudioElement | null = null;
  private _volume: number = 0.5;

  // Initialize audio element (idempotent)
  public init(src: string = './Assets/sound/game-loop.mp3') {
    try {
      if (this.audio) return;
      this.audio = new Audio(src);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.volume = this._volume;
      // Allow quick loading
      try { this.audio.load(); } catch (e) {}
    } catch (e) {}
  }

  // Play the looping background audio (call from a user gesture)
  public playLoop() {
    try {
      if (!this.audio) this.init();
      // play may be blocked by autoplay policies; ignore promise rejection
      this.audio?.play().catch(() => {});
    } catch (e) {}
  }

  public pause() {
    try { this.audio?.pause(); } catch (e) {}
  }

  public setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    try { if (this.audio) this.audio.volume = this._volume; } catch (e) {}
  }

  public toggleMute() {
    try { if (!this.audio) this.init(); if (this.audio) this.audio.muted = !this.audio.muted; } catch (e) {}
  }

  // Play a one-shot sound effect. `src` can be a path to the sound file.
  public playSfx(src: string = './Assets/sound/click.mp3') {
    try {
      const s = new Audio(src);
      s.preload = 'auto';
      s.volume = this._volume;
      s.play().catch(() => {});
    } catch (e) {}
  }
}

// export singleton
export const soundController = new SoundController();
export default soundController;
