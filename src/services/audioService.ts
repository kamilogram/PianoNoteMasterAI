class AudioService {
  private ctx: AudioContext | null = null;
  private oscillators: Map<string, OscillatorNode> = new Map();

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private getFrequency(note: string): number {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = parseInt(note.slice(-1));
    const key = notes.indexOf(note.slice(0, -1));
    return 440 * Math.pow(2, (octave - 4) + (key - 9) / 12);
  }

  playNote(note: string) {
    this.init();
    if (!this.ctx) return;

    this.stopNote(note);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.getFrequency(note), this.ctx.currentTime);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
    this.oscillators.set(note, osc);
  }

  stopNote(note: string) {
    const osc = this.oscillators.get(note);
    if (osc) {
      try {
        osc.stop();
      } catch (e) {}
      this.oscillators.delete(note);
    }
  }
}

export const audioService = new AudioService();
