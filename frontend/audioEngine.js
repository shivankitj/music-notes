
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.analyserMaster = null;
    this.analysers = {}; // per-stem analysers
    this.stemGains = {};
    this.reverbNode = null;
    this.reverbGain = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayGain = null;
    this.isReady = false;

    // Synth parameter state (set by latent controls)
    this.params = {
      filterCutoff: 2000,
      filterRes: 2,
      reverbMix: 0.3,
      delayTime: 0.25,
      delayFeedbackVal: 0.3,
      delayMix: 0.2,
      masterVolume: 0.7,
      // per-stem volumes
      leadVol: 0.6,
      padVol: 0.35,
      bassVol: 0.5,
      drumVol: 0.55,
    };
  }

  /** Initialize the AudioContext and build the signal graph */
  async init() {
    if (this.isReady) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master compressor
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.params.masterVolume;

    // Master analyser
    this.analyserMaster = this.ctx.createAnalyser();
    this.analyserMaster.fftSize = 2048;
    this.analyserMaster.smoothingTimeConstant = 0.8;

    // Build reverb (convolution with generated impulse)
    await this._buildReverb();

    // Build delay
    this._buildDelay();

    // Per-stem gain nodes and analysers
    const stems = ['lead', 'pad', 'bass', 'drums'];
    const volKeys = ['leadVol', 'padVol', 'bassVol', 'drumVol'];
    for (let i = 0; i < stems.length; i++) {
      const g = this.ctx.createGain();
      g.gain.value = this.params[volKeys[i]];
      const a = this.ctx.createAnalyser();
      a.fftSize = 512;
      a.smoothingTimeConstant = 0.75;
      g.connect(a);
      a.connect(this.compressor);
      // Also send to reverb & delay sends
      const revSend = this.ctx.createGain();
      revSend.gain.value = stems[i] === 'drums' ? 0.1 : 0.25;
      g.connect(revSend);
      revSend.connect(this.reverbGain);
      if (stems[i] === 'lead') {
        const dlySend = this.ctx.createGain();
        dlySend.gain.value = 0.2;
        g.connect(dlySend);
        dlySend.connect(this.delayNode);
      }
      this.stemGains[stems[i]] = g;
      this.analysers[stems[i]] = a;
    }

    // Routing
    this.compressor.connect(this.masterGain);
    this.reverbGain.connect(this.compressor);
    this.delayGain.connect(this.compressor);
    this.masterGain.connect(this.analyserMaster);
    this.analyserMaster.connect(this.ctx.destination);

    this.isReady = true;
  }

  /** Generate a synthetic impulse response for convolution reverb */
  async _buildReverb() {
    const length = this.ctx.sampleRate * 2.5; // 2.5s reverb tail
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // exponential decay with slight diffusion randomness
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = impulse;
    this.reverbNode = conv;
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = this.params.reverbMix;
    this.reverbGain.connect(this.reverbNode);
    this.reverbNode.connect(this.compressor); // reverb output -> compressor
    // Note: reverbGain is the send point; stems connect to reverbGain
  }

  /** Build a ping-pong style delay */
  _buildDelay() {
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = this.params.delayTime;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = this.params.delayFeedbackVal;
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = this.params.delayMix;
    // feedback loop
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);
  }



  /**
   * Play a lead note with dual detuned oscillators + filter envelope
   * @param {number} freq - Note frequency in Hz
   * @param {number} time - AudioContext time to start
   * @param {number} duration - Note length in seconds
   * @param {object} opts - { waveform, detune, attack, decay, sustain, release }
   */
  playLead(freq, time, duration, opts = {}) {
    const {
      waveform = 'sawtooth',
      detune = 8,
      attack = 0.02,
      decay = 0.1,
      sustain = 0.6,
      release = 0.15,
    } = opts;
    const t = time;
    const end = t + duration;

    // Oscillator 1
    const osc1 = this.ctx.createOscillator();
    osc1.type = waveform;
    osc1.frequency.value = freq;
    osc1.detune.value = detune;

    // Oscillator 2 (detuned opposite)
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq;
    osc2.detune.value = -detune;

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    filter.Q.value = this.params.filterRes;
    // Filter envelope
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.linearRampToValueAtTime(this.params.filterCutoff, t + attack);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(this.params.filterCutoff * sustain, 100), t + attack + decay
    );
    filter.frequency.exponentialRampToValueAtTime(200, end + release);

    // Amp envelope
    const ampEnv = this.ctx.createGain();
    ampEnv.gain.setValueAtTime(0, t);
    ampEnv.gain.linearRampToValueAtTime(0.35, t + attack);
    ampEnv.gain.linearRampToValueAtTime(0.35 * sustain, t + attack + decay);
    ampEnv.gain.setValueAtTime(0.35 * sustain, end);
    ampEnv.gain.linearRampToValueAtTime(0, end + release);

    // Routing
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(ampEnv);
    ampEnv.connect(this.stemGains.lead);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(end + release + 0.01);
    osc2.stop(end + release + 0.01);

    return { freq, time: t, duration, end: end + release };
  }

  /**
   * Play a warm pad chord (array of frequencies)
   * @param {number[]} freqs - Array of chord frequencies
   * @param {number} time - Start time
   * @param {number} duration - Duration in seconds
   */
  playPad(freqs, time, duration, opts = {}) {
    const { attack = 0.4, release = 0.6 } = opts;
    const t = time;
    const end = t + duration;
    const perVoiceGain = 0.12 / freqs.length;

    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 6;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(this.params.filterCutoff * 0.6, 3000);
      filter.Q.value = 0.7;

      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(perVoiceGain, t + attack);
      amp.gain.setValueAtTime(perVoiceGain, end);
      amp.gain.linearRampToValueAtTime(0, end + release);

      osc.connect(filter);
      filter.connect(amp);
      amp.connect(this.stemGains.pad);

      osc.start(t);
      osc.stop(end + release + 0.01);
    });
  }

  /**
   * Play a bass note (sine + triangle sub)
   * @param {number} freq - Note frequency
   * @param {number} time - Start time
   * @param {number} duration - Duration
   */
  playBass(freq, time, duration, opts = {}) {
    const { attack = 0.01, decay = 0.15, sustain = 0.7, release = 0.08 } = opts;
    const t = time;
    const end = t + duration;

    // Sub sine
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;

    // Warm triangle
    const tri = this.ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = freq;

    // Mix
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.35;
    const triGain = this.ctx.createGain();
    triGain.gain.value = 0.15;

    // Filter envelope
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(80, t);
    filter.frequency.linearRampToValueAtTime(Math.min(this.params.filterCutoff * 0.4, 1200), t + attack);
    filter.frequency.exponentialRampToValueAtTime(300, t + attack + decay);

    // Amp
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.4, t + attack);
    amp.gain.linearRampToValueAtTime(0.4 * sustain, t + attack + decay);
    amp.gain.setValueAtTime(0.4 * sustain, end);
    amp.gain.linearRampToValueAtTime(0, end + release);

    sub.connect(subGain);
    tri.connect(triGain);
    subGain.connect(filter);
    triGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.stemGains.bass);

    sub.start(t);
    tri.start(t);
    sub.stop(end + release + 0.01);
    tri.stop(end + release + 0.01);
  }

  /**
   * Play a drum hit
   * @param {'kick'|'snare'|'hihat'|'openhat'} type
   * @param {number} time
   * @param {number} velocity 0-1
   */
  playDrum(type, time, velocity = 0.8) {
    const t = time;
    const v = velocity;
    switch (type) {
      case 'kick': this._kick(t, v); break;
      case 'snare': this._snare(t, v); break;
      case 'hihat': this._hihat(t, v, 0.05); break;
      case 'openhat': this._hihat(t, v, 0.15); break;
    }
  }

  _kick(t, v) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(v * 0.7, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(amp);
    amp.connect(this.stemGains.drums);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  _snare(t, v) {
    // Noise burst
    const bufSize = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 1800;
    const nAmp = this.ctx.createGain();
    nAmp.gain.setValueAtTime(v * 0.4, t);
    nAmp.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(nFilter);
    nFilter.connect(nAmp);
    nAmp.connect(this.stemGains.drums);
    noise.start(t);
    noise.stop(t + 0.15);

    // Body tone
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
    const bAmp = this.ctx.createGain();
    bAmp.gain.setValueAtTime(v * 0.3, t);
    bAmp.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(bAmp);
    bAmp.connect(this.stemGains.drums);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  _hihat(t, v, dur) {
    const bufSize = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(v * 0.2, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filter);
    filter.connect(amp);
    amp.connect(this.stemGains.drums);
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }



  setFilterCutoff(val) {
    this.params.filterCutoff = val;
  }

  setFilterRes(val) {
    this.params.filterRes = val;
  }

  setReverbMix(val) {
    this.params.reverbMix = val;
    if (this.reverbGain) {
      this.reverbGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setDelayTime(val) {
    this.params.delayTime = val;
    if (this.delayNode) {
      this.delayNode.delayTime.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setDelayFeedback(val) {
    this.params.delayFeedbackVal = val;
    if (this.delayFeedback) {
      this.delayFeedback.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setDelayMix(val) {
    this.params.delayMix = val;
    if (this.delayGain) {
      this.delayGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setMasterVolume(val) {
    this.params.masterVolume = val;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }

  setStemVolume(stem, val) {
    const keys = { lead: 'leadVol', pad: 'padVol', bass: 'bassVol', drums: 'drumVol' };
    this.params[keys[stem]] = val;
    if (this.stemGains[stem]) {
      this.stemGains[stem].gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }



  /**
   * Render composition offline and return a WAV Blob
   * @param {function} renderFn - Function(offlineEngine, offlineCtx) that schedules all notes
   * @param {number} durationSec - Total duration to render
   * @returns {Promise<Blob>}
   */
  async exportWAV(renderFn, durationSec) {
    const sampleRate = 44100;
    const offCtx = new OfflineAudioContext(2, sampleRate * durationSec, sampleRate);

    // Build a minimal offline engine
    const offEngine = new OfflineEngine(offCtx, this.params);
    await offEngine.init();

    // Let the caller schedule all notes
    renderFn(offEngine, offCtx);

    // Render
    const renderedBuffer = await offCtx.startRendering();
    return this._bufferToWavBlob(renderedBuffer);
  }

  _bufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // RIFF header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    this._writeString(view, 8, 'WAVE');
    // fmt
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    // data
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave & write samples
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  _writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /** Resume context (required after user gesture) */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}



class OfflineEngine {
  constructor(ctx, params) {
    this.ctx = ctx;
    this.params = { ...params };
    this.masterGain = null;
    this.compressor = null;
    this.reverbNode = null;
    this.reverbGain = null;
  }

  async init() {
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.params.masterVolume;

    // Build impulse reverb
    const length = this.ctx.sampleRate * 2.5;
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
      }
    }
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = impulse;
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = this.params.reverbMix;

    this.reverbGain.connect(this.reverbNode);
    this.reverbNode.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  /** Schedule a lead note for offline render */
  playLead(freq, time, duration) {
    const t = time;
    const end = t + duration;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.linearRampToValueAtTime(this.params.filterCutoff, t + 0.02);
    filter.frequency.exponentialRampToValueAtTime(400, end + 0.1);
    filter.Q.value = this.params.filterRes;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.2, t + 0.02);
    amp.gain.setValueAtTime(0.2, end);
    amp.gain.linearRampToValueAtTime(0, end + 0.1);
    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.compressor);
    const revSend = this.ctx.createGain();
    revSend.gain.value = 0.2;
    amp.connect(revSend);
    revSend.connect(this.reverbGain);
    osc.start(t);
    osc.stop(end + 0.15);
  }

  playPad(freqs, time, duration) {
    const t = time;
    const end = t + duration;
    freqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(0.06, t + 0.3);
      amp.gain.setValueAtTime(0.06, end);
      amp.gain.linearRampToValueAtTime(0, end + 0.5);
      osc.connect(amp);
      amp.connect(this.compressor);
      osc.start(t);
      osc.stop(end + 0.55);
    });
  }

  playBass(freq, time, duration) {
    const t = time;
    const end = t + duration;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.3, t + 0.01);
    amp.gain.setValueAtTime(0.3, end);
    amp.gain.linearRampToValueAtTime(0, end + 0.08);
    osc.connect(amp);
    amp.connect(this.compressor);
    osc.start(t);
    osc.stop(end + 0.1);
  }

  playDrum(type, time, velocity = 0.8) {
    const t = time;
    const v = velocity;
    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(v * 0.7, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(amp);
      amp.connect(this.compressor);
      osc.start(t);
      osc.stop(t + 0.45);
    } else if (type === 'snare') {
      const bufSize = this.ctx.sampleRate * 0.12;
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(v * 0.35, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      noise.connect(f);
      f.connect(amp);
      amp.connect(this.compressor);
      noise.start(t);
      noise.stop(t + 0.15);
    } else {
      const dur = type === 'openhat' ? 0.15 : 0.05;
      const bufSize = this.ctx.sampleRate * dur;
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(v * 0.18, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(f);
      f.connect(amp);
      amp.connect(this.compressor);
      noise.start(t);
      noise.stop(t + dur + 0.01);
    }
  }
}
