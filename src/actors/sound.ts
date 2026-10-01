import type * as THREE from 'three';
import type { Phase, WeaponId } from '../contracts.ts';
import { MusicDirector } from './music.ts';

export type SoundKind = 'shot' | 'knife' | 'reload' | 'hit' | 'targetHit' | 'hurt' | 'taunt' | 'forced' | 'step' | 'reveal' | 'ui' | 'jump' | 'land' | 'climb' | 'edit' | 'roundStart' | 'switch' | 'denied' | 'ambient';
export type FootstepSurface = 'wood' | 'tile' | 'grass';
const WORLD_SCALE = 1 / 48;

/** Original, softly filtered synthesis. One hunter height is one acoustic metre. */
export class SoundSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.65;
  private musicVolume = 0.55;
  private music: MusicDirector | null = null;
  private disposed = false;
  private resumePending: Promise<void> | null = null;
  private voices = new Set<{ outlet: GainNode; panner?: PannerNode; nodes: AudioNode[] }>();
  private tauntCount = 0;
  private ambienceTime = 0;
  private actionBus: GainNode | null = null;
  private cueBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  /** Exposed for local audio capture, not connected until explicitly requested by QA. */
  get audioContext(): AudioContext | null { return this.context; }
  get output(): AudioNode | null { return this.limiter; }

  /** Call from the menu's user gesture. Construction and play before this are silent. */
  async init(): Promise<void> {
    if (this.disposed) return;
    if (!this.context) {
      if (typeof window === 'undefined') return;
      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain(); this.master.gain.value = this.volume * 0.95;
      this.actionBus = this.context.createGain(); this.actionBus.gain.value = 1;
      this.cueBus = this.context.createGain(); this.cueBus.gain.value = 0.72;
      this.ambienceBus = this.context.createGain(); this.ambienceBus.gain.value = 0.1;
      this.actionBus.connect(this.master); this.cueBus.connect(this.master); this.ambienceBus.connect(this.master);
      this.music = new MusicDirector(this.context, this.master); this.music.setVolume(this.musicVolume);
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -12; this.limiter.knee.value = 20; this.limiter.ratio.value = 5; this.limiter.attack.value = 0.004; this.limiter.release.value = 0.18;
      this.master.connect(this.limiter); this.limiter.connect(this.context.destination);
      const length = this.context.sampleRate;
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const values = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) { last = (last + (Math.random() * 2 - 1) * 0.16) / 1.16; values[i] = last * 2.8; }
    }
    if (this.context.state !== 'running' && this.context.state !== 'closed') {
      // A browser may reject one gesture, or suspend audio after switching tabs.
      // Keep the same graph and let the next gesture retry without an unhandled rejection.
      if (!this.resumePending) this.resumePending = this.context.resume().catch(() => {});
      const pending = this.resumePending;
      await pending;
      if (this.resumePending === pending) this.resumePending = null;
    }
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * 0.95, this.context.currentTime, 0.04);
  }

  /** Independent music level, still governed by master volume. Safe before user-gesture init. */
  setMusicVolume(value: number): void {
    this.musicVolume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    this.music?.setVolume(this.musicVolume);
  }

  /** Call every frame, including menu/pause/editor; remaining is the round clock in seconds. */
  updateMusic(phase: Phase, remaining: number, paused: boolean): void {
    this.music?.update(phase, remaining, paused);
  }

  /** Quiet room tone; outdoors adds a distant original bird phrase. Gameplay owns pause. */
  updateAmbience(dt: number, room: string, active: boolean): void {
    if (!active || !this.context || this.context.state !== 'running') { this.ambienceTime = 0; return; }
    this.ambienceTime -= dt;
    if (this.ambienceTime <= 0) {
      this.ambienceTime = 4.6 + Math.random() * 2.5;
      this.play('ambient', undefined, /花园|院|户外/.test(room) ? 'smg' : 'pistol');
    }
  }

  updateListener(position: THREE.Vector3, forward: THREE.Vector3): void {
    if (!this.context) return;
    const listener = this.context.listener, time = this.context.currentTime;
    // Keep a stable orthogonal up vector even when the camera aims nearly vertically.
    const length = Math.hypot(forward.x, forward.y, forward.z) || 1;
    const x = forward.x / length, y = forward.y / length, z = forward.z / length;
    const horizontal = Math.hypot(x, z);
    const upX = horizontal > 0.001 ? -x * y / horizontal : 0;
    const upY = horizontal > 0.001 ? horizontal : 0;
    const upZ = horizontal > 0.001 ? -z * y / horizontal : 1;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x * WORLD_SCALE, time); listener.positionY.setValueAtTime(position.y * WORLD_SCALE, time); listener.positionZ.setValueAtTime(position.z * WORLD_SCALE, time);
      listener.forwardX.setValueAtTime(x, time); listener.forwardY.setValueAtTime(y, time); listener.forwardZ.setValueAtTime(z, time);
      listener.upX.setValueAtTime(upX, time); listener.upY.setValueAtTime(upY, time); listener.upZ.setValueAtTime(upZ, time);
    } else { listener.setPosition(position.x * WORLD_SCALE, position.y * WORLD_SCALE, position.z * WORLD_SCALE); listener.setOrientation(x, y, z, upX, upY, upZ); }
  }

  play(kind: SoundKind, position?: THREE.Vector3, weapon: WeaponId = 'pistol', surface: FootstepSurface = 'wood'): void {
    const context = this.context;
    if (!context || !this.master || this.disposed || context.state !== 'running' || this.volume <= 0 || this.voices.size >= 48) return;
    if (kind === 'taunt') this.music?.duck(0.25, 1.1);
    else if (kind === 'forced') this.music?.duck(0.25, 0.85);
    else if (kind === 'step' || kind === 'climb') this.music?.duck(0.68, 0.2);
    const start = context.currentTime + 0.003;
    const outlet = context.createGain(); outlet.gain.value = 1;
    const bus = kind === 'ambient' ? this.ambienceBus! : ['ui','edit','denied','roundStart','reveal'].includes(kind) ? this.cueBus! : this.actionBus!;
    let panner: PannerNode | undefined;
    if (position) {
      panner = context.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
      panner.refDistance = 2.2; panner.maxDistance = 36; panner.rolloffFactor = 0.85;
      panner.positionX.value = position.x * WORLD_SCALE; panner.positionY.value = position.y * WORLD_SCALE; panner.positionZ.value = position.z * WORLD_SCALE;
      outlet.connect(panner); panner.connect(bus);
    } else outlet.connect(bus);
    const voice = { outlet, panner, nodes: [] as AudioNode[] }; this.voices.add(voice);
    let end = start + 0.08;
    const track = <T extends AudioNode>(node: T): T => { voice.nodes.push(node); return node; };
    const tone = (frequency: number, duration: number, gain: number, offset = 0, type: OscillatorType = 'sine', endFrequency = frequency) => {
      const at = start + offset, stop = at + duration, oscillator = track(context.createOscillator()), envelope = track(context.createGain());
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), stop);
      envelope.gain.setValueAtTime(0.0001, at); envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + Math.min(0.025, duration * 0.18)); envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
      oscillator.connect(envelope); envelope.connect(outlet); oscillator.start(at); oscillator.stop(stop + 0.015); end = Math.max(end, stop + 0.03);
    };
    const noise = (frequency: number, duration: number, gain: number, offset = 0, type: BiquadFilterType = 'lowpass') => {
      if (!this.noise) return;
      const at = start + offset, source = track(context.createBufferSource()), filter = track(context.createBiquadFilter()), envelope = track(context.createGain());
      source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
      source.loop = duration > 0.8;
      envelope.gain.setValueAtTime(0.0001, at); envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.007); envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter); filter.connect(envelope); envelope.connect(outlet); source.start(at, Math.random() * 0.3); source.stop(at + duration + 0.02); end = Math.max(end, at + duration + 0.04);
    };
    const variation = 0.97 + Math.random() * 0.06;
    switch (kind) {
      case 'shot': {
        const heavy = weapon === 'shotgun', rapid = weapon === 'smg';
        tone((heavy ? 115 : rapid ? 160 : 190) * variation, heavy ? 0.2 : 0.11, heavy ? 0.38 : 0.24, 0, 'sine', heavy ? 42 : 65);
        noise(heavy ? 1650 : rapid ? 2500 : 3200, heavy ? 0.28 : 0.13, heavy ? 0.62 : 0.42);
        tone(heavy ? 310 : 420, 0.06, 0.05, 0.005, 'triangle', 170);
        noise(4200, 0.025, heavy ? 0.16 : 0.11, 0, 'highpass');
        if (heavy) noise(700, 0.24, 0.1, 0.12);
        break;
      }
      case 'knife': noise(1100, 0.18, 0.25, 0, 'bandpass'); tone(250, 0.11, 0.035, 0, 'sine', 100); break;
      case 'reload':
        noise(1850, 0.07, 0.24); tone(260, 0.09, 0.09, 0, 'triangle', 220);
        noise(2900, 0.075, 0.28, 0.24); tone(460, 0.08, 0.08, 0.27, 'sine', 330); break;
      case 'hit': tone(680, 0.12, 0.13, 0, 'sine', 570); tone(1020, 0.095, 0.07, 0.018); noise(650, 0.065, 0.1); break;
      case 'targetHit':
        noise(6200,0.035,0.18,0,'highpass');
        tone(1180*variation,0.3,0.14,0,'sine',1060);
        tone(1769*variation,0.22,0.08,0.006,'sine',1720);
        tone(2781*variation,0.15,0.035,0.009,'sine',2700);
        noise(850,0.1,0.1,0.02);break;
      case 'hurt': tone(165, 0.23, 0.22, 0, 'sine', 78); noise(340, 0.17, 0.22); break;
      case 'step':
        tone((surface==='tile'?170:95) * variation, 0.085, surface==='grass'?.075:.13, 0, 'sine', 52);
        noise(surface==='grass'?1500:surface==='tile'?2450:680, surface==='grass'?.13:.085, surface==='grass'?.2:.21,0,surface==='grass'?'bandpass':'lowpass');
        if(surface==='tile')tone(650*variation,.047,.035,.012,'triangle',420);
        break;
      case 'jump': noise(1350,.16,.17,0,'bandpass'); tone(145,.12,.095,0,'sine',225); break;
      case 'land': tone(115,.19,.23,0,'sine',43); noise(800,.19,.27); noise(1800,.065,.07,.03,'bandpass'); break;
      case 'climb': noise(1800,.14,.15,0,'bandpass'); tone(170,.07,.08,0,'triangle',100); break;
      case 'switch': noise(1900,.065,.16); tone(290,.075,.065,0,'triangle',410); break;
      case 'edit': tone(780,.06,.105,0,'sine',620); noise(1300,.04,.05); break;
      case 'denied': tone(220,.13,.14,0,'triangle',165); tone(165,.12,.085,.12); break;
      case 'roundStart':
        [392,523.25,659.25].forEach((note,i)=>{tone(note,.35,.2,i*.12,'triangle');tone(note*2,.23,.025,i*.12)});noise(450,.25,.09,.1);break;
      case 'ambient':
        noise(530,3.8,.12,0,'bandpass');
        if(weapon==='smg'){tone(1650,.22,.13,.7,'sine',2150);tone(1850,.19,.1,1.02,'sine',2300);tone(1700,.23,.09,3.1,'sine',2050)}
        break;
      case 'taunt': {
        // Four friendly flute phrases. Slow breath envelopes and tiny harmonics avoid harsh beeps.
        const melodies = [[659.25, 783.99, 987.77], [783.99, 659.25, 587.33, 659.25], [523.25, 659.25, 783.99], [987.77, 783.99, 659.25, 783.99]];
        const notes = melodies[this.tauntCount++ % melodies.length];
        notes.forEach((note, index) => {
          const offset = index * 0.19; tone(note * variation, 0.29, 0.19, offset); tone(note * 2 * variation, 0.22, 0.013, offset);
          noise(1900, 0.24, 0.012, offset, 'bandpass');
        });
        break;
      }
      case 'forced':
        // Low rounded two-note owl call, distinct from the voluntary flute phrase.
        tone(392 * variation, 0.36, 0.2, 0, 'sine', 349 * variation); tone(293.66 * variation, 0.43, 0.18, 0.32, 'sine', 261.63 * variation);
        tone(784, 0.28, 0.012); noise(650, 0.68, 0.025, 0, 'bandpass'); break;
      case 'reveal':
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => { tone(note, 0.55, 0.12, i * 0.12); tone(note * 2, 0.35, 0.012, i * 0.12); }); break;
      case 'ui': tone(587.33, 0.09, 0.13); tone(783.99, 0.12, 0.07, 0.035); break;
    }
    // A silent buffer source provides audio-clock cleanup, independent of background-tab timers.
    const cleanup = context.createBufferSource(); cleanup.buffer = context.createBuffer(1, 1, context.sampleRate); cleanup.connect(outlet);
    cleanup.onended = () => { voice.nodes.forEach(node => node.disconnect()); outlet.disconnect(); panner?.disconnect(); cleanup.disconnect(); this.voices.delete(voice); };
    cleanup.start(end); voice.nodes.push(cleanup);
  }

  dispose(): void {
    this.disposed = true;
    this.music?.dispose(); this.music = null;
    for (const voice of this.voices) { voice.nodes.forEach(node => node.disconnect()); voice.outlet.disconnect(); voice.panner?.disconnect(); }
    this.voices.clear(); this.master?.disconnect(); this.limiter?.disconnect();
    this.actionBus?.disconnect(); this.cueBus?.disconnect(); this.ambienceBus?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null; this.master = null; this.noise = null;
  }
}
