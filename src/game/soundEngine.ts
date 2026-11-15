import { RouletteOutcome, VehicleMode } from './worldMath';
import { WeaponId } from './store';

const ENGINE_PROFILES: Record<Exclude<VehicleMode, 'FOOT'>, { type: OscillatorType; base: number; span: number; cutoff: number; vol: number }> = {
  CAR: { type: 'sawtooth', base: 52, span: 110, cutoff: 340, vol: 0.045 },
  BOAT: { type: 'triangle', base: 42, span: 68, cutoff: 220, vol: 0.05 },
  PLANE: { type: 'sawtooth', base: 85, span: 165, cutoff: 520, vol: 0.04 },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted && this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateEngine(mode: VehicleMode, speedKmh: number): void {
    const ctx = this.ensureContext();
    if (!ctx || mode === 'FOOT') {
      if (this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    if (!this.engineOsc || !this.engineGain || !this.engineFilter) {
      this.engineOsc = ctx.createOscillator();
      this.engineFilter = ctx.createBiquadFilter();
      this.engineGain = ctx.createGain();
      this.engineFilter.type = 'lowpass';
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(ctx.destination);
      this.engineOsc.start();
    }
    const now = ctx.currentTime;
    const s = Math.min(Math.abs(speedKmh) / 140, 1.5);
    const cfg = ENGINE_PROFILES[mode];
    this.engineOsc.type = cfg.type;
    this.engineOsc.frequency.setTargetAtTime(cfg.base + s * cfg.span, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(cfg.cutoff + s * 240, now, 0.08);
    this.engineGain.gain.setTargetAtTime(cfg.vol * (0.4 + s * 0.6), now, 0.08);
  }

  public playGunshot(weaponId: WeaponId = 'AR'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (weaponId === 'SNIPER') {
      this.tone(ctx, 180, 'sawtooth', 0, 0.22, 0.16);
      this.tone(ctx, 90, 'triangle', 0.02, 0.35, 0.18);
    } else if (weaponId === 'SHOTGUN') {
      this.tone(ctx, 130, 'square', 0, 0.18, 0.16);
      this.tone(ctx, 75, 'sawtooth', 0.01, 0.24, 0.15);
    } else if (weaponId === 'RPG') {
      this.tone(ctx, 95, 'sawtooth', 0, 0.42, 0.18);
      this.tone(ctx, 55, 'sine', 0.04, 0.5, 0.2);
    } else if (weaponId === 'MINIGUN') {
      this.tone(ctx, 260, 'sawtooth', 0, 0.06, 0.11);
    } else {
      this.tone(ctx, 220, 'sawtooth', 0, 0.09, 0.13);
    }
  }

  public playHitMarker(eliminated = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.tone(ctx, 1480, 'triangle', 0, 0.07, 0.12);
    if (eliminated) {
      [587.33, 880, 1174.66].forEach((f, i) => this.tone(ctx, f, 'sine', 0.05 + i * 0.06, 0.24, 0.14));
    }
  }

  public playParachuteDeploy(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [330, 440, 659.25].forEach((f, i) => this.tone(ctx, f, 'sine', i * 0.07, 0.3, 0.09));
  }

  public playChipPickup(isAerial = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    (isAerial ? [1046.5, 1318.5, 1568, 2093] : [987.77, 1318.5]).forEach((f, i) => this.tone(ctx, f, 'sine', i * 0.055, 0.22, 0.09));
  }

  public playRouletteFanfare(outcome: RouletteOutcome = 'GREEN_00'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const chord = outcome === 'RED' ? [440, 554.37, 659.25, 880] : outcome === 'BLACK' ? [392, 466.16, 587.33, 783.99] : [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => this.tone(ctx, f, 'triangle', i * 0.09, 0.45, 0.08));
  }

  private tone(ctx: AudioContext, freq: number, type: OscillatorType, delay: number, dur: number, peak: number): void {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const soundEngine = new SoundEngine();
