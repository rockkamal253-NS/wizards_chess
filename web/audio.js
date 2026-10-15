// ============================================================================
// SYNTHESIZED CATHEDRAL WEB AUDIO ACOUSTICS
// ============================================================================
export class CathedralAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playSelect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playSlide() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.32);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.24;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(175, now);
    filter.frequency.linearRampToValueAtTime(115, now + 0.32);
    filter.Q.value = 3.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.30, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(now);
  }

  playShatter() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.45);
    oGain.gain.setValueAtTime(0.85, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(oGain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);

    for (let i = 0; i < 6; i++) {
      const delay = i * 0.032 + Math.random() * 0.018;
      const bSize = Math.floor(this.ctx.sampleRate * 0.14);
      const buf = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let j = 0; j < bSize; j++) ch[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bSize * 0.28));
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 950 + i * 340;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.34, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);
      src.connect(bp).connect(g).connect(this.ctx.destination);
      src.start(now + delay);
    }
  }
}

export const sfx = new CathedralAudio();
