// A quiet synthesized wing buzz. No microphone, remote audio, or autoplay.
export class HabitatSound {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.oscillator = this.context.createOscillator();
      this.gain = this.context.createGain();
      this.pan = this.context.createStereoPanner();
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 850;
      this.oscillator.type = 'triangle';
      this.oscillator.frequency.value = 190;
      this.gain.gain.value = 0;
      this.oscillator
        .connect(filter)
        .connect(this.gain)
        .connect(this.pan)
        .connect(this.context.destination);
      this.oscillator.start();
    }
    await this.context.resume();
  }
  update(flight: number, x: number, enabled: boolean) {
    if (!this.context || !this.gain || !this.oscillator || !this.pan) return;
    const t = this.context.currentTime;
    this.gain.gain.setTargetAtTime(enabled ? flight * 0.022 : 0, t, 0.1);
    this.oscillator.frequency.setTargetAtTime(185 + flight * 45, t, 0.08);
    this.pan.pan.setTargetAtTime(
      Math.max(-0.65, Math.min(0.65, x / 5)),
      t,
      0.2,
    );
  }
  dispose() {
    this.oscillator?.stop();
    void this.context?.close();
    this.context = null;
  }
}
