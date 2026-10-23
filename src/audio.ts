import type { GameEvent } from './engine.ts';

export type SoundSettings = { music: number; effects: number; muted: boolean };
export class PaperAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  effectGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  settings: SoundSettings;
  active = false;
  failed = false;
  timer: ReturnType<typeof setInterval> | null = null;
  nextNote = 0;
  beat = 0;
  voices = new Set<AudioScheduledSourceNode>();
  noise: AudioBuffer | null = null;
  constructor() {
    this.settings = { music: .34, effects: .72, muted: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('paper-duel-sound') || '{}')); } catch { /* storage is optional */ }
  }
  async start(): Promise<void> {
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = .7;
        this.musicGain = ctx.createGain(); this.effectGain = ctx.createGain();
        this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
        this.musicGain.connect(this.master); this.effectGain.connect(this.master);
        this.master.connect(this.analyser); this.analyser.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = this.noise.getChannelData(0); let previous = 0;
        for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .08) / 1.08; samples[i] = previous * 3; }
        this.timer = setInterval(() => this.schedule(), 80);
      }
      await this.context.resume(); this.failed = false; this.active = true;
      this.nextNote = this.context.currentTime + .08; this.apply(); this.schedule();
    } catch { this.failed = true; }
  }
  apply(): void {
    const ctx = this.context;
    if (ctx && this.musicGain && this.effectGain) {
      const muted = this.settings.muted ? 0 : 1;
      this.musicGain.gain.setTargetAtTime(this.settings.music * muted, ctx.currentTime, .03);
      this.effectGain.gain.setTargetAtTime(this.settings.effects * muted, ctx.currentTime, .03);
    }
    try { localStorage.setItem('paper-duel-sound', JSON.stringify(this.settings)); } catch { /* private mode */ }
  }
  track(source: AudioScheduledSourceNode): void {
    this.voices.add(source); source.onended = () => { this.voices.delete(source); source.disconnect(); };
  }
  tone(frequency: number, when: number, duration: number, volume: number, kind: OscillatorType = 'triangle', music = false): void {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(); const envelope = ctx.createGain(); const filter = ctx.createBiquadFilter();
    oscillator.type = kind; oscillator.frequency.setValueAtTime(frequency, when);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(music ? 1800 : 3200, when);
    envelope.gain.setValueAtTime(.0001, when); envelope.gain.exponentialRampToValueAtTime(Math.max(.001, volume), when + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(filter); filter.connect(envelope); envelope.connect((music ? this.musicGain : this.effectGain)!);
    oscillator.start(when); oscillator.stop(when + duration + .015); this.track(oscillator);
  }
  rustle(duration: number, volume: number, frequency: number, delay = 0): void {
    const ctx = this.context; if (!ctx || !this.noise || ctx.state !== 'running') return;
    const source = ctx.createBufferSource(); const gain = ctx.createGain(); const filter = ctx.createBiquadFilter();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), t + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.effectGain!);
    source.start(t, Math.random() * .35); source.stop(t + duration); this.track(source);
  }
  schedule(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.active) return;
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + .04;
    const melody = [69, 0, 76, 72, 0, 74, 71, 0, 67, 0, 72, 71, 0, 69, 64, 0,
      65, 0, 72, 69, 0, 71, 67, 0, 64, 0, 67, 71, 0, 69, 0, 0];
    while (this.nextNote < ctx.currentTime + .16) {
      const note = melody[this.beat % melody.length];
      if (note) this.tone(440 * 2 ** ((note - 69) / 12), this.nextNote, .6, .11, 'triangle', true);
      if (this.beat % 4 === 0) this.tone(440 * 2 ** (((this.beat % 16 < 8 ? 45 : 41) - 69) / 12), this.nextNote, .75, .10, 'sine', true);
      if (this.beat % 4 === 2) this.tone(this.beat % 8 === 2 ? 196 : 147, this.nextNote, .045, .07, 'triangle', true);
      this.beat++; this.nextNote += .333333;
    }
  }
  handle(event: GameEvent): void {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    switch (event.type) {
      case 'judgement':
        this.rustle(.075, .25, 1700);
        if (event.quality === 'perfect') { this.tone(740, now, .12, .1); this.tone(988, now + .025, .15, .06); }
        else if (event.quality === 'miss' || event.quality === 'hazard') this.tone(130, now, .13, .1);
        break;
      case 'player_roll': this.rustle(.17, .25, 1000); this.tone(290, now, .1, .08); break;
      case 'player_attack':
        this.rustle(.16, event.roll?.critical ? .8 : .5, 1900);
        this.tone(event.roll?.critical ? 110 : 165, now, .19, .18, 'triangle'); break;
      case 'player_miss': this.rustle(.16, .22, 2400); break;
      case 'enemy_attack': this.rustle(.22, .4, 900); break;
      case 'player_hurt': this.tone(92, now, .26, .2, 'triangle'); this.rustle(.16, .4, 500); break;
      case 'blocked': case 'guard': this.tone(330, now, .08, .16); this.tone(495, now + .012, .1, .09); break;
      case 'heal': case 'enemy_heal': [523, 659, 784].forEach((f, i) => this.tone(f, now + i * .06, .26, .075)); break;
      case 'no_heal': this.rustle(.06, .1, 500); break;
      case 'enemy_windup': this.rustle(.12, .18, 400); this.tone(185, now, .14, .08); break;
      case 'speed': this.tone(event.amount! > 0 ? 620 : 310, now, .18, .09); break;
      case 'summon': case 'familiar_gulp': case 'familiar_grow':
        this.rustle(.35, .35, 1500); [392, 523, 659].forEach((f, i) => this.tone(f, now + i * .08, .35, .08)); break;
      case 'familiar_attack': this.rustle(.12, .3, 2200); this.tone(480, now, .09, .09); break;
      case 'level_up': case 'upgrade': [440, 554, 659, 880].forEach((f, i) => this.tone(f, now + i * .055, .28, .07)); break;
      case 'threat': this.tone(110, now, .35, .15); this.rustle(.3, .2, 450); break;
      case 'wave_clear': case 'won':
        this.active = false; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, now + i * .11, .65, .10)); break;
      case 'lost': this.active = false; [220, 196, 147].forEach((f, i) => this.tone(f, now + i * .15, .6, .10)); break;
      case 'next_wave': this.active = true; this.nextNote = now + .1; break;
      case 'pause': this.pause(); break;
    }
  }
  stopVoices(): void { for (const voice of this.voices) { try { voice.stop(); } catch { /* already stopped */ } } this.voices.clear(); }
  pause(): void { this.active = false; this.stopVoices(); this.context?.suspend().catch(() => undefined); }
  reset(): void { this.stopVoices(); this.beat = 0; if (this.context) this.nextNote = this.context.currentTime + .1; }
  get rms(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize); this.analyser.getByteTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / data.length);
  }
}
