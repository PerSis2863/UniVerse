// Hyperion Signals → Audio (M473): hands the page the exact samples flowing through it, in blocks of 4096, so a
// recording is lossless (MediaRecorder would compress it). Loaded with audioWorklet.addModule from this site.
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(4096); this.n = 0; } }
    return true;
  }
}
registerProcessor('uv-pcm-tap', PcmTap);
