

const COLORS = {
  lead:   { r: 0, g: 240, b: 255, hex: '#00f0ff' },
  pad:    { r: 139, g: 92, b: 246, hex: '#8b5cf6' },
  bass:   { r: 255, g: 0, b: 229, hex: '#ff00e5' },
  drums:  { r: 251, g: 191, b: 36, hex: '#fbbf24' },
  grid:   { r: 148, g: 163, b: 184, hex: '#94a3b8' },
  bg:     '#0b0f1a',
  bgDeep: '#06080d',
};

// ── Waveform / Oscilloscope Visualizer ───────────────────────

export class WaveformVisualizer {
  constructor(canvas, analyser, color = COLORS.lead) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.color = color;
    this.dataArray = null;
    this.running = false;
    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.analyser) {
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this._draw();
  }

  stop() {
    this.running = false;
  }

  _draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this._draw());

    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(6, 8, 13, 0.3)';
    ctx.fillRect(0, 0, w, h);

    if (!this.analyser || !this.dataArray) {
      this._drawIdleLine();
      return;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);

    // Glow effect
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color.hex;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.color.hex;
    ctx.beginPath();

    const sliceWidth = w / this.dataArray.length;
    let x = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _drawIdleLine() {
    const { ctx, w, h } = this;
    ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    // Gentle sine idle wave
    const time = performance.now() / 1000;
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.02 + time * 2) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  destroy() {
    this.running = false;
    this._resizeObserver.disconnect();
  }
}

export class SpectrumVisualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.running = false;
    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this._draw();
  }

  stop() { this.running = false; }

  _draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this._draw());

    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(6, 8, 13, 0.35)';
    ctx.fillRect(0, 0, w, h);

    this.analyser.getByteFrequencyData(this.freqData);

    const barCount = 64;
    const step = Math.floor(this.freqData.length / barCount);
    const barWidth = (w / barCount) - 1;

    for (let i = 0; i < barCount; i++) {
      const val = this.freqData[i * step] / 255;
      const barHeight = val * h * 0.85;

      // Gradient color from cyan to violet
      const t = i / barCount;
      const r = Math.floor(0 + t * 139);
      const g = Math.floor(240 - t * 148);
      const b = Math.floor(255 - t * 9);

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + val * 0.4})`;
      ctx.shadowBlur = val > 0.5 ? 8 : 0;
      ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;

      const x = i * (barWidth + 1);
      ctx.fillRect(x, h - barHeight, barWidth, barHeight);
    }
    ctx.shadowBlur = 0;
  }

  destroy() {
    this.running = false;
    this._resizeObserver.disconnect();
  }
}

export class LatentSpaceGrid {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} styleAnchors - { name: { x: 0-1, y: 0-1, color }, ... }
   * @param {function} onChange - callback({ x, y }) when user drags
   */
  constructor(canvas, styleAnchors, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.anchors = styleAnchors;
    this.onChange = onChange;
    this.position = { x: 0.5, y: 0.5 }; // normalized 0-1
    this.isDragging = false;
    this.running = false;
    this.hoverAnchor = null;

    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
    this._bindEvents();
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  _bindEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.position = getPos(e);
      if (this.onChange) this.onChange(this.position);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.position = getPos(e);
        if (this.onChange) this.onChange(this.position);
      }
      // Check hover on anchors
      const pos = getPos(e);
      this.hoverAnchor = null;
      for (const [name, anchor] of Object.entries(this.anchors)) {
        const dist = Math.hypot(pos.x - anchor.x, pos.y - anchor.y);
        if (dist < 0.08) {
          this.hoverAnchor = name;
          break;
        }
      }
    });

    window.addEventListener('mouseup', () => { this.isDragging = false; });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.position = getPos(e);
      if (this.onChange) this.onChange(this.position);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.isDragging) {
        this.position = getPos(e);
        if (this.onChange) this.onChange(this.position);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { this.isDragging = false; });
  }

  /** Snap position to a named anchor */
  snapTo(name) {
    const anchor = this.anchors[name];
    if (anchor) {
      this.position = { x: anchor.x, y: anchor.y };
      if (this.onChange) this.onChange(this.position);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._draw();
  }

  stop() { this.running = false; }

  _draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this._draw());

    const { ctx, w, h } = this;
    const time = performance.now() / 1000;

    // Clear
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 0.5;
    const gridStep = w / 12;
    for (let i = 1; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridStep, 0);
      ctx.lineTo(i * gridStep, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * (h / 12));
      ctx.lineTo(w, i * (h / 12));
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw anchor points
    for (const [name, anchor] of Object.entries(this.anchors)) {
      const ax = anchor.x * w;
      const ay = anchor.y * h;
      const isHover = this.hoverAnchor === name;

      // Radial glow
      const grad = ctx.createRadialGradient(ax, ay, 0, ax, ay, isHover ? 35 : 25);
      grad.addColorStop(0, `${anchor.color}33`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(ax - 40, ay - 40, 80, 80);

      // Dot
      ctx.beginPath();
      ctx.arc(ax, ay, isHover ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = anchor.color;
      ctx.fill();

      // Label
      ctx.font = `500 ${isHover ? '11px' : '9px'} 'Space Grotesk', sans-serif`;
      ctx.fillStyle = isHover ? '#e8ecf4' : '#4b5a73';
      ctx.textAlign = 'center';
      ctx.fillText(name.toUpperCase(), ax, ay - 12);
    }

    // Draw connection lines from position to anchors (with distance fade)
    const px = this.position.x * w;
    const py = this.position.y * h;

    for (const [, anchor] of Object.entries(this.anchors)) {
      const ax = anchor.x * w;
      const ay = anchor.y * h;
      const dist = Math.hypot(this.position.x - anchor.x, this.position.y - anchor.y);
      const alpha = Math.max(0, 0.3 - dist * 0.5);

      ctx.strokeStyle = `${anchor.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw position node
    // Outer ring animation
    const ringRadius = 12 + Math.sin(time * 3) * 2;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner dot
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    const dotGrad = ctx.createRadialGradient(px, py, 0, px, py, 5);
    dotGrad.addColorStop(0, '#ffffff');
    dotGrad.addColorStop(1, '#00f0ff');
    ctx.fillStyle = dotGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cross-hair
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(px, 0); ctx.lineTo(px, h);
    ctx.moveTo(0, py); ctx.lineTo(w, py);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  destroy() {
    this.running = false;
    this._resizeObserver.disconnect();
  }
}

export class PianoRollVisualizer {
  constructor(canvas, sequencer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sequencer = sequencer;
    this.running = false;
    this.windowDuration = 8; // seconds visible
    this.midiRange = { low: 36, high: 96 };

    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._draw();
  }

  stop() { this.running = false; }

  _draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this._draw());

    const { ctx, w, h, sequencer } = this;
    const now = sequencer.elapsedTime;
    const windowStart = now - this.windowDuration;
    const midiSpan = this.midiRange.high - this.midiRange.low;

    // Clear
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, w, h);

    // Piano key guides
    for (let midi = this.midiRange.low; midi <= this.midiRange.high; midi++) {
      const y = h - ((midi - this.midiRange.low) / midiSpan) * h;
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      if (midi % 12 === 0) {
        // C note - slightly brighter line
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(w, y);
        ctx.stroke();
      } else if (isBlack) {
        // Darkened row for black keys
        const rowH = h / midiSpan;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, y - rowH / 2, w, rowH);
      }
    }

    // Draw beat lines
    if (sequencer.style.bpm > 0) {
      const secPerBeat = 60 / sequencer.style.bpm;
      const firstBeat = Math.ceil(windowStart / secPerBeat) * secPerBeat;
      for (let beatTime = firstBeat; beatTime <= now; beatTime += secPerBeat) {
        const x = ((beatTime - windowStart) / this.windowDuration) * w;
        const isMeasure = Math.round(beatTime / secPerBeat) % 4 === 0;
        ctx.strokeStyle = isMeasure ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.05)';
        ctx.lineWidth = isMeasure ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
        ctx.stroke();
      }
    }

    // Draw notes
    const notes = sequencer.noteLog;
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const noteEnd = note.time + note.duration;

      // Skip notes outside window
      if (noteEnd < windowStart || note.time > now) continue;

      const midi = note.midi;
      if (midi < this.midiRange.low || midi > this.midiRange.high) continue;

      const x1 = Math.max(0, ((note.time - windowStart) / this.windowDuration) * w);
      const x2 = Math.min(w, ((noteEnd - windowStart) / this.windowDuration) * w);
      const y = h - ((midi - this.midiRange.low) / midiSpan) * h;
      const noteH = Math.max(2, h / midiSpan * 0.7);

      const color = COLORS[note.stem] || COLORS.lead;
      const isActive = note.time <= now && noteEnd >= now;

      // Note rectangle
      ctx.fillStyle = isActive
        ? `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`
        : `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`;
      ctx.shadowBlur = isActive ? 8 : 0;
      ctx.shadowColor = color.hex;

      const rw = Math.max(2, x2 - x1);
      ctx.beginPath();
      ctx.roundRect(x1, y - noteH / 2, rw, noteH, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Playhead
    const phX = w; // always at right edge (now)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(phX - 1, 0);
    ctx.lineTo(phX - 1, h);
    ctx.stroke();

    // Glow at playhead
    const phGrad = ctx.createLinearGradient(phX - 30, 0, phX, 0);
    phGrad.addColorStop(0, 'transparent');
    phGrad.addColorStop(1, 'rgba(0, 240, 255, 0.06)');
    ctx.fillStyle = phGrad;
    ctx.fillRect(phX - 30, 0, 30, h);
  }

  destroy() {
    this.running = false;
    this._resizeObserver.disconnect();
  }
}

// ── Source Analysis Fake-Waveform Visualizer ──────────────────
// Shows a generated waveform with animated "scanning" effect

export class SourceWaveformVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.waveformData = null; // Float32Array generated
    this.scanProgress = 0;   // 0-1
    this.isScanning = false;

    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
    this._generateWaveform();
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  _generateWaveform() {
    // Generate a realistic-looking waveform shape
    const points = 400;
    this.waveformData = new Float32Array(points);
    let val = 0;
    for (let i = 0; i < points; i++) {
      // Musical envelope with phrases
      const phraseEnv = 0.3 + 0.7 * Math.pow(Math.sin((i / points) * Math.PI * 3), 2);
      val += (Math.random() - 0.5) * 0.3;
      val *= 0.92;
      this.waveformData[i] = val * phraseEnv;
    }
  }

  /** Set real audio buffer data for display */
  setAudioBuffer(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const points = 400;
    this.waveformData = new Float32Array(points);
    const step = Math.floor(data.length / points);
    for (let i = 0; i < points; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += Math.abs(data[i * step + j] || 0);
      }
      this.waveformData[i] = sum / step;
    }
  }

  startScan() {
    this.isScanning = true;
    this.scanProgress = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._draw();
  }

  stop() { this.running = false; }

  _draw() {
    if (!this.running) return;
    requestAnimationFrame(() => this._draw());

    const { ctx, w, h, waveformData } = this;

    // Clear
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, w, h);

    if (!waveformData) return;

    // Draw waveform
    const points = waveformData.length;
    const barW = w / points;
    const centerY = h / 2;
    const maxH = h * 0.4;

    for (let i = 0; i < points; i++) {
      const val = Math.abs(waveformData[i]);
      const barHeight = val * maxH * 2;
      const x = i * barW;

      let alpha = 0.4;
      let color = '148, 163, 184';

      // Scan effect
      if (this.isScanning) {
        const scanX = this.scanProgress * points;
        if (i < scanX) {
          color = '0, 240, 255';
          alpha = 0.7;
        }
        if (Math.abs(i - scanX) < 5) {
          alpha = 1;
        }
      }

      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barW - 0.5), barHeight || 1);
    }

    // Scan line
    if (this.isScanning && this.scanProgress < 1) {
      const scanX = this.scanProgress * w;
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      this.scanProgress += 0.004;
      if (this.scanProgress >= 1) {
        this.isScanning = false;
      }
    }

    // Center line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
  }

  destroy() {
    this.running = false;
    this._resizeObserver.disconnect();
  }
}
