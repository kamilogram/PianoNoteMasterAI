/**
 * Audio Input Service
 * Supports:
 * 1. Web MIDI API for digital keyboards/pianos connected via USB
 * 2. Microphone Pitch Detection using Autocorrelation for acoustic pianos/keyboards
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface AudioInputStatus {
  isMidiConnected: boolean;
  midiDeviceName: string | null;
  isMicActive: boolean;
  detectedPitch: string | null;
  detectedFrequency: number | null;
  volumeLevel: number; // 0 to 1
  micError: string | null;
}

type PitchCallback = (pitch: string) => void;
type StatusCallback = (status: AudioInputStatus) => void;

class AudioInputService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  
  private midiAccess: MIDIAccess | null = null;
  private onPitchCallback: PitchCallback | null = null;
  private onStatusCallback: StatusCallback | null = null;

  private lastDetectedPitch: string | null = null;
  private lastTriggeredPitch: string | null = null;
  private lastPitchTime: number = 0;
  private pitchStableCount: number = 0;

  private highpassFilter: BiquadFilterNode | null = null;
  private bassBoostFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;

  private status: AudioInputStatus = {
    isMidiConnected: false,
    midiDeviceName: null,
    isMicActive: false,
    detectedPitch: null,
    detectedFrequency: null,
    volumeLevel: 0,
    micError: null
  };

  public setCallbacks(onPitch: PitchCallback, onStatus?: StatusCallback) {
    this.onPitchCallback = onPitch;
    this.onStatusCallback = onStatus;
    this.notifyStatus();
  }

  private notifyStatus() {
    if (this.onStatusCallback) {
      this.onStatusCallback({ ...this.status });
    }
  }

  // --- WEBMIDI INTEGRATION ---
  public async initMidi(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.setupMidiInputs();

      this.midiAccess.onstatechange = () => {
        this.setupMidiInputs();
      };
      return this.status.isMidiConnected;
    } catch (err) {
      console.warn('MIDI access rejected or failed:', err);
      return false;
    }
  }

  private setupMidiInputs() {
    if (!this.midiAccess) return;

    let connected = false;
    let deviceName: string | null = null;

    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      connected = true;
      deviceName = input.name || 'USB MIDI Device';
      input.onmidimessage = this.handleMidiMessage.bind(this);
    }

    this.status.isMidiConnected = connected;
    this.status.midiDeviceName = deviceName;
    this.notifyStatus();
  }

  private handleMidiMessage(event: MIDIMessageEvent) {
    const data = event.data;
    if (!data || data.length < 3) return;

    const command = data[0] >> 4;
    const note = data[1];
    const velocity = data[2];

    // Command 9 = Note On (velocity > 0)
    if (command === 9 && velocity > 0) {
      const pitchName = NOTE_NAMES[note % 12];
      const octave = Math.floor(note / 12) - 1;
      const pitch = `${pitchName}${octave}`;

      if (this.onPitchCallback) {
        this.onPitchCallback(pitch);
      }
    }
  }

  // --- MICROPHONE PITCH DETECTION ---
  public async startMicrophone(): Promise<boolean> {
    this.stopMicrophone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.mediaStream = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);

      // Low-cut filter to eliminate sub-bass DC rumble < 25 Hz
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 25;

      // Low-shelf boost to amplify fundamental frequencies (60Hz - 220Hz) of low piano notes
      this.bassBoostFilter = this.audioContext.createBiquadFilter();
      this.bassBoostFilter.type = 'lowshelf';
      this.bassBoostFilter.frequency.value = 220;
      this.bassBoostFilter.gain.value = 4.0;

      // High-cut filter to eliminate excessive acoustic hiss above 3500 Hz
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = 3500;

      this.analyser = this.audioContext.createAnalyser();
      // 4096 gives large enough buffer window to capture low bass notes like C2 (65Hz) and C3 (130Hz)
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0;
      
      source.connect(this.highpassFilter);
      this.highpassFilter.connect(this.bassBoostFilter);
      this.bassBoostFilter.connect(this.lowpassFilter);
      this.lowpassFilter.connect(this.analyser);

      this.status.isMicActive = true;
      this.status.micError = null;
      this.notifyStatus();

      this.detectPitchLoop();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dostęp do mikrofonu został odrzucony.';
      this.status.isMicActive = false;
      this.status.micError = msg;
      this.notifyStatus();
      return false;
    }
  }

  public stopMicrophone() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.highpassFilter) {
      try { this.highpassFilter.disconnect(); } catch (e) {}
      this.highpassFilter = null;
    }

    if (this.bassBoostFilter) {
      try { this.bassBoostFilter.disconnect(); } catch (e) {}
      this.bassBoostFilter = null;
    }

    if (this.lowpassFilter) {
      try { this.lowpassFilter.disconnect(); } catch (e) {}
      this.lowpassFilter = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyser = null;
    this.status.isMicActive = false;
    this.status.detectedPitch = null;
    this.status.detectedFrequency = null;
    this.status.volumeLevel = 0;
    this.notifyStatus();
  }

  private lastNotifyTime: number = 0;

  private detectPitchLoop = () => {
    if (!this.analyser || !this.status.isMicActive) return;

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS volume level
    let sumSquare = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquare += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquare / buffer.length);
    const newVolumeLevel = Math.min(1, rms * 12); // Responsive volume visualizer

    const now = performance.now();
    let newPitch: string | null = null;
    let newFreq: number | null = null;

    // Noise gate threshold: 0.0035 captures gentle playing while ignoring ambient room silence
    if (rms > 0.0035) {
      const freq = this.detectPitchYin(buffer, this.audioContext?.sampleRate || 44100);
      
      if (freq !== -1) {
        const midiNum = Math.round(12 * Math.log2(freq / 440) + 69);
        const pitchName = NOTE_NAMES[midiNum % 12];
        const octave = Math.floor(midiNum / 12) - 1;
        newPitch = `${pitchName}${octave}`;
        newFreq = Math.round(freq * 10) / 10;

        // Stability filter to eliminate spurious noise triggers
        if (newPitch === this.lastDetectedPitch) {
          this.pitchStableCount++;
        } else {
          this.lastDetectedPitch = newPitch;
          this.pitchStableCount = 1;
        }

        // Trigger note press if pitch is stable and cooldown elapsed
        const minCooldown = (newPitch !== this.lastTriggeredPitch) ? 100 : 200;
        if (this.pitchStableCount >= 2 && (now - this.lastPitchTime > minCooldown)) {
          this.lastPitchTime = now;
          this.lastTriggeredPitch = newPitch;
          if (this.onPitchCallback) {
            this.onPitchCallback(newPitch);
          }
        }
      } else {
        this.pitchStableCount = 0;
      }
    } else {
      this.pitchStableCount = 0;
    }

    const pitchChanged = this.status.detectedPitch !== newPitch;
    const volumeChanged = Math.abs(this.status.volumeLevel - newVolumeLevel) > 0.03;
    const timeElapsed = now - this.lastNotifyTime > 60;

    this.status.volumeLevel = newVolumeLevel;
    this.status.detectedFrequency = newFreq;
    this.status.detectedPitch = newPitch;

    if (pitchChanged || (volumeChanged && timeElapsed) || timeElapsed) {
      this.lastNotifyTime = now;
      this.notifyStatus();
    }

    this.animFrameId = requestAnimationFrame(this.detectPitchLoop);
  };

  /**
   * Enhanced YIN pitch detection algorithm with harmonic verification
   * Resolves octave doubling / halving (reliably distinguishing B2-D#3 ~120-160Hz from B3-D#4 ~240-320Hz).
   */
  private detectPitchYin(buffer: Float32Array, sampleRate: number): number {
    const bufferSize = buffer.length;
    const yinBufferSize = Math.floor(bufferSize / 2);
    const yinBuffer = new Float32Array(yinBufferSize);

    // Min/Max period (tau) range for piano: ~28 Hz (A0/C1) to ~2200 Hz (C7)
    const minTau = Math.max(4, Math.floor(sampleRate / 2200));
    const maxTau = Math.min(yinBufferSize - 2, Math.floor(sampleRate / 28));

    // Step 1: Difference Function
    for (let tau = 1; tau <= maxTau; tau++) {
      let diff = 0;
      for (let i = 0; i < yinBufferSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        diff += delta * delta;
      }
      yinBuffer[tau] = diff;
    }

    // Step 2: Cumulative Mean Normalized Difference Function (CMNDF)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] = runningSum > 0 ? (yinBuffer[tau] * tau) / runningSum : 1;
    }

    // Step 3: Find all local minima in CMNDF
    interface LocalMin {
      tau: number;
      val: number;
    }
    const localMinima: LocalMin[] = [];
    let globalMinTau = -1;
    let globalMinVal = Infinity;

    for (let tau = minTau + 1; tau < maxTau - 1; tau++) {
      if (yinBuffer[tau] < yinBuffer[tau - 1] && yinBuffer[tau] <= yinBuffer[tau + 1]) {
        const val = yinBuffer[tau];
        localMinima.push({ tau, val });
        if (val < globalMinVal) {
          globalMinVal = val;
          globalMinTau = tau;
        }
      }
    }

    // Reject unvoiced/silent/excessively noisy frames
    if (localMinima.length === 0 || globalMinVal > 0.45) {
      return -1;
    }

    // Step 4: Intelligent Fundamental Selection (resolves octave doubling on B2-D#3)
    let chosenTau = globalMinTau;

    // Filter candidate minima that have low periodicity difference (val < 0.22)
    const candidates = localMinima.filter(m => m.val < 0.22);
    if (candidates.length > 0) {
      // Sort candidates by tau (shortest period to longest)
      candidates.sort((a, b) => a.tau - b.tau);

      for (const cand of candidates) {
        // Check if there is an octave subharmonic (period ~2x or ~3x) with a strong/deep dip
        let hasDeeperFundamental = false;
        
        for (const other of localMinima) {
          // Check 2x period (octave lower, e.g. B2 vs B3)
          if (other.tau >= cand.tau * 1.85 && other.tau <= cand.tau * 2.15) {
            // If the 2x period has a deeper or comparable clean dip, it is the true fundamental
            if (other.val < cand.val * 0.90 || (other.val < 0.12 && cand.val > 0.06)) {
              hasDeeperFundamental = true;
              break;
            }
          }
          // Check 3x period (compound fifth lower)
          if (other.tau >= cand.tau * 2.80 && other.tau <= cand.tau * 3.20) {
            if (other.val < cand.val * 0.85) {
              hasDeeperFundamental = true;
              break;
            }
          }
        }

        if (!hasDeeperFundamental) {
          chosenTau = cand.tau;
          break;
        }
      }
    }

    if (chosenTau <= 0 || chosenTau >= maxTau) {
      return -1;
    }

    // Step 5: Parabolic Interpolation for sub-sample accuracy
    let refinedTau = chosenTau;
    const x0 = yinBuffer[chosenTau - 1];
    const x1 = yinBuffer[chosenTau];
    const x2 = yinBuffer[chosenTau + 1];

    const denominator = 2 * (2 * x1 - x2 - x0);
    if (Math.abs(denominator) > 1e-6) {
      const delta = (x2 - x0) / denominator;
      refinedTau = chosenTau + delta;
    }

    if (refinedTau <= 0) return -1;

    const frequency = sampleRate / refinedTau;

    if (frequency >= 28 && frequency <= 2200) {
      return frequency;
    }

    return -1;
  }
}

export const audioInputService = new AudioInputService();
