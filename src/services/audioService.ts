class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private hammerBuffer: AudioBuffer | null = null;
  private activeVoices: Map<string, { stop: () => void }> = new Map();

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Dynamics Compressor for acoustic warmth and clean polyphony
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(3.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.08, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getHammerBuffer(ctx: AudioContext): AudioBuffer {
    if (this.hammerBuffer && this.hammerBuffer.sampleRate === ctx.sampleRate) {
      return this.hammerBuffer;
    }
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.035); // 35ms felt strike
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Exponentially shaped felt impact noise
      const envelope = Math.exp(-i / (sampleRate * 0.006));
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    this.hammerBuffer = buffer;
    return buffer;
  }

  private getFrequency(pitch: string): number {
    const PITCH_SEMITONES: Record<string, number> = {
      'C': 0, 'B#': 0,
      'C#': 1, 'DB': 1,
      'D': 2,
      'D#': 3, 'EB': 3,
      'E': 4, 'FB': 4,
      'F': 5, 'E#': 5,
      'F#': 6, 'GB': 6,
      'G': 7,
      'G#': 8, 'AB': 8,
      'A': 9,
      'A#': 10, 'BB': 10,
      'B': 11, 'CB': 11
    };

    const match = pitch.toUpperCase().match(/^([A-G][#B]?)(-?\d+)$/);
    if (!match) return 440;
    const noteName = match[1];
    const octave = parseInt(match[2], 10);
    const semitone = PITCH_SEMITONES[noteName] ?? 9;
    const midiNumber = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
  }

  playNote(pitch: string, velocity = 0.8) {
    this.init();
    if (!this.ctx || !this.compressor) return;

    // Stop any currently playing voice of the exact same pitch smoothly
    this.stopNote(pitch);

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = this.getFrequency(pitch);

    // Natural acoustic decay time based on register (bass rings longer, treble decays faster)
    const baseDecay = Math.max(0.85, Math.min(3.4, 2.3 - Math.log2(freq / 261.63) * 0.45));
    const nodesToStop: { stop: (time: number) => void }[] = [];

    // 1. Hammer Felt Attack Transient (percussive acoustic sound of wooden hammer hitting string)
    try {
      const hammerSource = ctx.createBufferSource();
      hammerSource.buffer = this.getHammerBuffer(ctx);

      const hammerFilter = ctx.createBiquadFilter();
      hammerFilter.type = 'bandpass';
      hammerFilter.frequency.setValueAtTime(Math.min(freq * 2.8 + 800, 4200), now);
      hammerFilter.Q.setValueAtTime(1.8, now);

      const hammerGain = ctx.createGain();
      const hammerVol = Math.min(0.18, 0.05 + 0.08 * (velocity));
      hammerGain.gain.setValueAtTime(hammerVol, now);
      hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      hammerSource.connect(hammerFilter);
      hammerFilter.connect(hammerGain);
      hammerGain.connect(this.compressor);

      hammerSource.start(now);
      hammerSource.stop(now + 0.035);
      nodesToStop.push(hammerSource);
    } catch {
      // Continue if hammer buffer fails
    }

    // 2. Soundboard Acoustic Resonance Filter
    const soundboardFilter = ctx.createBiquadFilter();
    soundboardFilter.type = 'lowpass';
    const initialCutoff = Math.min(freq * 5.5 + 1500, 8500);
    const finalCutoff = Math.min(freq * 1.6 + 400, 2200);
    soundboardFilter.frequency.setValueAtTime(initialCutoff, now);
    soundboardFilter.frequency.exponentialRampToValueAtTime(finalCutoff, now + baseDecay * 0.7);
    soundboardFilter.Q.setValueAtTime(1.1, now);
    soundboardFilter.connect(this.compressor);

    // 3. String Unisons & Harmonics (Tri-chord detuning + natural overtone decay)
    // Overtone specifications: [harmonicMultiple, detuneInCents, amplitudeRatio, decayMultiplier, waveType]
    const partials: [number, number, number, number, OscillatorType][] = [
      // Fundamental tri-chord (slight acoustic detuning creates the authentic grand piano shimmer)
      [1.0, 0.0, 0.38, 1.0, 'sine'],
      [1.0, 1.5, 0.28, 0.95, 'sine'],
      [1.0, -1.5, 0.28, 0.95, 'sine'],
      [1.0, 0.0, 0.15, 0.85, 'triangle'], // Adds subtle body warmth

      // 2nd Harmonic (Octave)
      [2.0, 0.8, 0.24, 0.65, 'sine'],
      [2.0, -0.8, 0.18, 0.65, 'sine'],

      // 3rd Harmonic (Fifth)
      [3.0, 0.0, 0.14, 0.42, 'sine'],

      // 4th Harmonic (Double Octave)
      [4.0, 0.0, 0.08, 0.28, 'sine'],

      // 5th Harmonic (Initial acoustic strike sparkle)
      [5.0, 0.0, 0.04, 0.18, 'sine'],
    ];

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(velocity * 0.7, now);
    voiceGain.connect(soundboardFilter);

    partials.forEach(([mult, detune, amp, decayMult, type]) => {
      const osc = ctx.createOscillator();
      const pGain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq * mult, now);
      osc.detune.setValueAtTime(detune, now);

      const pDecay = baseDecay * decayMult;
      const initialAmp = Math.max(0.0001, amp);

      // Acoustic piano envelope: instantaneous attack (2ms), quick initial drop, followed by long smooth exponential tail
      pGain.gain.setValueAtTime(0.0001, now);
      pGain.gain.linearRampToValueAtTime(initialAmp, now + 0.003);
      pGain.gain.exponentialRampToValueAtTime(initialAmp * 0.45, now + 0.12);
      pGain.gain.exponentialRampToValueAtTime(0.00005, now + pDecay);

      osc.connect(pGain);
      pGain.connect(voiceGain);

      osc.start(now);
      osc.stop(now + pDecay + 0.05);
      nodesToStop.push(osc);
    });

    this.activeVoices.set(pitch, {
      stop: () => {
        const stopTime = ctx.currentTime;
        voiceGain.gain.cancelScheduledValues(stopTime);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, stopTime);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.06);
        setTimeout(() => {
          nodesToStop.forEach(n => {
            try { n.stop(stopTime + 0.07); } catch {}
          });
        }, 80);
      }
    });

    // Automatically clean up voice map after decay
    setTimeout(() => {
      if (this.activeVoices.get(pitch)?.stop) {
        this.activeVoices.delete(pitch);
      }
    }, (baseDecay + 0.1) * 1000);
  }

  stopNote(pitch: string) {
    const voice = this.activeVoices.get(pitch);
    if (voice) {
      voice.stop();
      this.activeVoices.delete(pitch);
    }
  }
}

export const audioService = new AudioService();

