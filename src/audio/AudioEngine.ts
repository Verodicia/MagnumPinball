/**
 * Procedural Web Audio engine (no asset files): synthesised solenoid clacks, bumper/target/chime callouts
 * and a pitch-modulated ball-roll loop tied to ball speed. Sounds are panned by playfield x.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private rollSrc!: AudioBufferSourceNode;
  private noise!: AudioBuffer;
  muted = false;
  private volume = 0.6;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.rollSrc = ctx.createBufferSource();
    this.rollSrc.buffer = this.noise;
    this.rollSrc.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.Q.value = 1.2;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.rollSrc.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    this.rollSrc.start();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && !this.muted) {
      this.master.gain.value = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : this.volume;
  }

  /** Ball roll loop: speed in cm/s, `rolling` false when airborne/on a ramp deck gap/held. */
  setRoll(speed: number, rolling: boolean): void {
    if (!this.ctx) return;
    const v = rolling ? Math.min(speed / 300, 1) : 0;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(v * v * 0.25, t, 0.03);
    this.rollFilter.frequency.setTargetAtTime(180 + v * 1400, t, 0.05); // pitch rises with speed
    this.rollSrc.playbackRate.setTargetAtTime(0.7 + v * 0.8, t, 0.05);
  }

  /** Play a named effect; `x` (cm, 0..56) pans it across the table. */
  sfx(name: string, x?: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const out: AudioNode = this.master;
    let dest: AudioNode = out;
    if (x !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, (x / 56) * 2 - 1)) * 0.8;
      p.connect(out);
      dest = p;
    }
    const tone = (f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0): void => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(dest);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.02);
    };
    const click = (dur: number, freq: number, vol: number): void => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    };
    switch (name) {
      case 'flipper': click(0.05, 1800, 0.5); tone(140, 60, 0.08, 'square', 0.25); break; // solenoid clack
      case 'plunger': click(0.08, 900, 0.5); tone(90, 40, 0.15, 'triangle', 0.4); break;
      case 'bumper': tone(520, 180, 0.12, 'square', 0.25); click(0.04, 2500, 0.3); break;
      case 'sling': click(0.05, 1400, 0.5); tone(260, 90, 0.1, 'sawtooth', 0.2); break;
      case 'target': click(0.06, 700, 0.6); tone(300, 120, 0.1, 'triangle', 0.3); break;
      case 'spinner': tone(1400, 1100, 0.03, 'square', 0.12); break;
      case 'rollover': tone(880, 880, 0.12, 'sine', 0.2); tone(1320, 1320, 0.14, 'sine', 0.15, 0.06); break;
      case 'ramp': tone(300, 900, 0.3, 'triangle', 0.18); break;
      case 'jackpot_lit': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'square', 0.16, i * 0.08)); break;
      case 'tilt': tone(200, 70, 0.6, 'sawtooth', 0.35); break;
      case 'drain': tone(400, 60, 0.6, 'triangle', 0.35); break;
      case 'nudge': click(0.12, 200, 0.6); break;
      default: tone(660, 440, 0.1, 'sine', 0.2);
    }
  }
}
