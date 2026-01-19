export type SoundMap = { [key: string]: string };

export default class SoundController {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private loading: Map<string, Promise<void>> = new Map();
  private _muted = false;
  private _volume = 1;
  private musicAudio: HTMLAudioElement | null = null;
  private currentMusic: string | null = null;

  // Preload a set of named audio files. Returns a promise that resolves when all are ready.
  public preload(list: SoundMap): Promise<void> {
    const entries = Object.entries(list || {});
    const promises = entries.map(([key, url]) => this.loadSingle(key, url));
    return Promise.all(promises).then(() => undefined);
  }

  private loadSingle(key: string, url: string): Promise<void> {
    if (this.loading.has(key)) return this.loading.get(key)!;
    const p = new Promise<void>((resolve) => {
      try {
        const a = new Audio();
        a.src = url;
        a.preload = 'auto';
        // attempt to decode enough data for playback
        const onReady = () => {
          a.removeEventListener('canplaythrough', onReady);
          a.removeEventListener('error', onErr);
          this.sounds.set(key, a);
          resolve();
        };
        const onErr = () => {
          a.removeEventListener('canplaythrough', onReady);
          a.removeEventListener('error', onErr);
          // store the element anyway (may still play)
          this.sounds.set(key, a);
          resolve();
        };
        a.addEventListener('canplaythrough', onReady, { once: true });
        a.addEventListener('error', onErr, { once: true });
        // start loading
        // browsers may delay load until user gesture; still fine to create
        a.load();
      } catch (e) {
        // swallow and resolve so preload doesn't reject
        try { this.sounds.set(key, new Audio(url)); } catch (e) {}
        resolve();
      }
    });
    this.loading.set(key, p);
    return p;
  }

  // Play a sound. For short effects we clone the audio element so multiple overlaps work.
  public play(key: string, opts?: { loop?: boolean; volume?: number; music?: boolean }): HTMLAudioElement | null {
    if (this._muted) return null;
    const a = this.sounds.get(key);
    if (!a) return null;
    const volume = typeof opts?.volume === 'number' ? opts!.volume : 1;
    if (opts?.music) {
      // stop previous music
      try { if (this.musicAudio) { this.musicAudio.pause(); this.musicAudio.currentTime = 0; } } catch (e) {}
      const ma = a.cloneNode(true) as HTMLAudioElement;
      ma.loop = !!opts?.loop;
      ma.volume = this._volume * volume;
      ma.play().catch(() => {});
      this.musicAudio = ma;
      this.currentMusic = key;
      return ma;
    }
    // sound effect: clone for overlap
    const node = a.cloneNode(true) as HTMLAudioElement;
    node.loop = !!opts?.loop;
    node.volume = this._volume * volume;
    node.play().catch(() => {});
    // optional cleanup after end if not looping
    if (!node.loop) {
      node.addEventListener('ended', () => { try { node.remove(); } catch (e) {} }, { once: true });
    }
    return node;
  }

  public stopMusic() {
    try {
      if (this.musicAudio) {
        this.musicAudio.pause();
        this.musicAudio.currentTime = 0;
      }
    } catch (e) {}
    this.musicAudio = null;
    this.currentMusic = null;
  }

  public setMuted(v: boolean) {
    this._muted = !!v;
    if (this._muted) {
      try { this.stopMusic(); } catch (e) {}
    }
  }

  public isMuted() { return !!this._muted; }

  public setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.musicAudio) this.musicAudio.volume = this._volume;
  }

  public getVolume() { return this._volume; }

  // Convenience: preload default project sounds from `./sound/` folder
  public preloadDefaults() {
    return this.preload({
      kick: './sound/kick.mp3',
      goal: './sound/goal.mp3',
      save: './sound/save.mp3',
      crowd: './sound/crowd.mp3',
    });
  }
}

// export singleton
export const soundController = new SoundController();
export { soundController as SoundControllerSingleton };
