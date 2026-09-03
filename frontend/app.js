// ═══════════════════════════════════════════════════════════════
// app.js — Main Application Controller
// Orchestrates UI, audio engine, sequencer, and visualizers.
// Handles presets, file upload, analysis flow, and export.
// ═══════════════════════════════════════════════════════════════

import { AudioEngine } from './audioEngine.js';
import { Sequencer, SCALES, NOTE_NAMES, DRUM_PATTERNS } from './sequencer.js';
import {
  WaveformVisualizer,
  SpectrumVisualizer,
  LatentSpaceGrid,
  PianoRollVisualizer,
  SourceWaveformVisualizer,
} from './visualizers.js';

// ── Style Presets ────────────────────────────────────────────

const PRESETS = {
  jazz: {
    name: 'Jazz Improvisation',
    bpm: 105,
    swing: 0.55,
    density: 0.55,
    scale: 'dorian',
    rootNote: 60,
    chordStyle: 'jazz',
    phraseLength: 8,
    leapProbability: 0.25,
    octaveRange: 2,
    drumPattern: 'swing',
    filterBrightness: 0.45,
    filterResonance: 0.3,
    reverbAmount: 0.35,
    delayAmount: 0.2,
    padEnabled: true,
    bassEnabled: true,
    drumsEnabled: true,
    leadEnabled: true,
    latentPos: { x: 0.2, y: 0.25 },
  },
  synthwave: {
    name: 'Synthwave Horizon',
    bpm: 118,
    swing: 0.0,
    density: 0.7,
    scale: 'minorPentatonic',
    rootNote: 57,   // A3
    chordStyle: 'pop',
    phraseLength: 4,
    leapProbability: 0.35,
    octaveRange: 2,
    drumPattern: 'driving',
    filterBrightness: 0.72,
    filterResonance: 0.5,
    reverbAmount: 0.25,
    delayAmount: 0.35,
    padEnabled: true,
    bassEnabled: true,
    drumsEnabled: true,
    leadEnabled: true,
    latentPos: { x: 0.78, y: 0.22 },
  },
  classical: {
    name: 'Classical Sonata',
    bpm: 90,
    swing: 0.1,
    density: 0.45,
    scale: 'major',
    rootNote: 60,
    chordStyle: 'pop',
    phraseLength: 8,
    leapProbability: 0.3,
    octaveRange: 3,
    drumPattern: 'sparse',
    filterBrightness: 0.55,
    filterResonance: 0.15,
    reverbAmount: 0.5,
    delayAmount: 0.1,
    padEnabled: true,
    bassEnabled: true,
    drumsEnabled: false,
    leadEnabled: true,
    latentPos: { x: 0.25, y: 0.75 },
  },
  ambient: {
    name: 'Ambient Textures',
    bpm: 72,
    swing: 0.15,
    density: 0.25,
    scale: 'lydian',
    rootNote: 65,   // F4
    chordStyle: 'jazz',
    phraseLength: 16,
    leapProbability: 0.15,
    octaveRange: 2,
    drumPattern: 'sparse',
    filterBrightness: 0.35,
    filterResonance: 0.2,
    reverbAmount: 0.7,
    delayAmount: 0.45,
    padEnabled: true,
    bassEnabled: true,
    drumsEnabled: true,
    leadEnabled: true,
    latentPos: { x: 0.75, y: 0.78 },
  },
};

const LATENT_ANCHORS = {
  jazz:       { x: 0.2,  y: 0.25, color: '#00f0ff' },
  synthwave:  { x: 0.78, y: 0.22, color: '#ff00e5' },
  classical:  { x: 0.25, y: 0.75, color: '#a3ff12' },
  ambient:    { x: 0.75, y: 0.78, color: '#8b5cf6' },
};

// ── Application ──────────────────────────────────────────────

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.sequencer = new Sequencer(this.engine);
    this.isPlaying = false;
    this.isAnalyzed = false;
    this.currentPreset = 'jazz';
    this.exportDuration = 30;
    this.sessionId = null;

    // API base URL (same origin since Express serves frontend)
    this.API_BASE = '/api';

    // Visualizers
    this.vizSourceWaveform = null;
    this.vizSpectrum = null;
    this.vizLatentGrid = null;
    this.vizPianoRoll = null;
    this.vizStems = {};

    // DOM cache
    this.dom = {};

    // Log queue
    this._logQueue = [];
  }

  async init() {
    this._cacheDom();
    this._bindEvents();
    this._initVisualizers();
    this._applyPreset('jazz');
    this._updateTransportDisplay();

    // Check backend health
    try {
      const res = await fetch(`${this.API_BASE}/health`);
      const data = await res.json();
      this._log(`Backend connected: ${data.service} v${data.version}`);
    } catch (e) {
      this._log('⚠ Backend connection failed — running in standalone mode.');
    }
    this._log('Web Audio synthesis engine ready. Select a source to begin.');
  }

  // ── DOM Caching ────────────────────────────────────────

  _cacheDom() {
    const q = (s) => document.querySelector(s);
    const qa = (s) => document.querySelectorAll(s);

    this.dom = {
      // Buttons
      btnAnalyze: q('#btn-analyze'),
      btnPlay: q('#btn-play'),
      btnStop: q('#btn-stop'),
      btnExport: q('#btn-export'),
      btnExportConfirm: q('#btn-export-confirm'),
      btnExportCancel: q('#btn-export-cancel'),

      // Transport
      transportTime: q('#transport-time'),
      transportStatus: q('#transport-status'),
      transportBpm: q('#transport-bpm'),
      progressFill: q('#progress-fill'),

      // Presets
      presetChips: qa('.preset-chip'),

      // Upload
      uploadZone: q('#upload-zone'),
      fileInput: q('#file-input'),

      // Canvases
      canvasSource: q('#canvas-source'),
      canvasSpectrum: q('#canvas-spectrum'),
      canvasLatent: q('#canvas-latent'),
      canvasPianoRoll: q('#canvas-piano-roll'),
      canvasStemLead: q('#canvas-stem-lead'),
      canvasStemPad: q('#canvas-stem-pad'),
      canvasStemBass: q('#canvas-stem-bass'),
      canvasStemDrums: q('#canvas-stem-drums'),

      // Sliders
      sliderBrightness: q('#slider-brightness'),
      sliderResonance: q('#slider-resonance'),
      sliderBpm: q('#slider-bpm'),
      sliderSwing: q('#slider-swing'),
      sliderDensity: q('#slider-density'),
      sliderPhrase: q('#slider-phrase'),
      sliderLeap: q('#slider-leap'),
      sliderReverb: q('#slider-reverb'),
      sliderDelay: q('#slider-delay'),

      // Slider value displays
      valBrightness: q('#val-brightness'),
      valResonance: q('#val-resonance'),
      valBpm: q('#val-bpm'),
      valSwing: q('#val-swing'),
      valDensity: q('#val-density'),
      valPhrase: q('#val-phrase'),
      valLeap: q('#val-leap'),
      valReverb: q('#val-reverb'),
      valDelay: q('#val-delay'),

      // Selectors
      selectScale: q('#select-scale'),
      selectDrumPattern: q('#select-drum-pattern'),

      // Duration chips
      durationChips: qa('.duration-chip'),

      // Analysis steps
      analysisSteps: qa('.analysis-step'),

      // Modal
      modalOverlay: q('#modal-export'),
      modalDuration: q('#modal-duration'),

      // Log
      logLine: q('#log-msg'),
      statusDots: qa('.status-dot'),

      // Play icon svg
      playIcon: q('#play-icon'),
    };
  }

  // ── Event Binding ──────────────────────────────────────

  _bindEvents() {
    // Preset chips
    this.dom.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.dataset.preset;
        this._applyPreset(preset);
      });
    });

    // Analyze button
    this.dom.btnAnalyze.addEventListener('click', () => this._runAnalysis());

    // Play/Stop
    this.dom.btnPlay.addEventListener('click', () => this._togglePlayback());

    // Export
    this.dom.btnExport.addEventListener('click', () => this._openExportModal());
    this.dom.btnExportConfirm.addEventListener('click', () => this._doExport());
    this.dom.btnExportCancel.addEventListener('click', () => this._closeExportModal());
    this.dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.modalOverlay) this._closeExportModal();
    });

    // Upload zone
    this.dom.uploadZone.addEventListener('click', () => this.dom.fileInput.click());
    this.dom.fileInput.addEventListener('change', (e) => this._handleUpload(e));
    this.dom.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dom.uploadZone.classList.add('dragover');
    });
    this.dom.uploadZone.addEventListener('dragleave', () => {
      this.dom.uploadZone.classList.remove('dragover');
    });
    this.dom.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dom.uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        this._processFile(e.dataTransfer.files[0]);
      }
    });

    // Duration chips
    this.dom.durationChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.dom.durationChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.exportDuration = parseInt(chip.dataset.duration);
      });
    });

    // Sliders
    this._bindSlider('sliderBrightness', 'valBrightness', (v) => {
      this.sequencer.style.filterBrightness = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderResonance', 'valResonance', (v) => {
      this.sequencer.style.filterResonance = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderBpm', 'valBpm', (v) => {
      this.sequencer.style.bpm = v;
      this.dom.transportBpm.innerHTML = `${Math.round(v)}<span>BPM</span>`;
    }, (v) => Math.round(v));

    this._bindSlider('sliderSwing', 'valSwing', (v) => {
      this.sequencer.style.swing = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderDensity', 'valDensity', (v) => {
      this.sequencer.style.density = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderPhrase', 'valPhrase', (v) => {
      this.sequencer.style.phraseLength = Math.round(v);
    }, (v) => `${Math.round(v)} beats`);

    this._bindSlider('sliderLeap', 'valLeap', (v) => {
      this.sequencer.style.leapProbability = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderReverb', 'valReverb', (v) => {
      this.sequencer.style.reverbAmount = v;
    }, (v) => `${Math.round(v * 100)}%`);

    this._bindSlider('sliderDelay', 'valDelay', (v) => {
      this.sequencer.style.delayAmount = v;
    }, (v) => `${Math.round(v * 100)}%`);

    // Selects
    this.dom.selectScale.addEventListener('change', (e) => {
      this.sequencer.style.scale = e.target.value;
      this._log(`Scale → ${e.target.value}`);
    });

    this.dom.selectDrumPattern.addEventListener('change', (e) => {
      this.sequencer.style.drumPattern = e.target.value;
      this._log(`Drum pattern → ${e.target.value}`);
    });

    // Keyboard shortcut: space to toggle playback
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        this._togglePlayback();
      }
    });
  }

  _bindSlider(sliderKey, valueKey, onChange, formatFn) {
    const slider = this.dom[sliderKey];
    const display = this.dom[valueKey];
    if (!slider) return;

    const update = () => {
      const v = parseFloat(slider.value);
      onChange(v);
      if (display) display.textContent = formatFn(v);
    };

    slider.addEventListener('input', update);
    update(); // initial
  }

  // ── Visualizer Init ────────────────────────────────────

  _initVisualizers() {
    // Source waveform
    this.vizSourceWaveform = new SourceWaveformVisualizer(this.dom.canvasSource);
    this.vizSourceWaveform.start();

    // Latent space grid
    this.vizLatentGrid = new LatentSpaceGrid(
      this.dom.canvasLatent,
      LATENT_ANCHORS,
      (pos) => this._onLatentPositionChange(pos)
    );
    this.vizLatentGrid.start();
  }

  _startLiveVisualizers() {
    // Spectrum
    if (this.dom.canvasSpectrum && this.engine.analyserMaster) {
      this.vizSpectrum = new SpectrumVisualizer(this.dom.canvasSpectrum, this.engine.analyserMaster);
      this.vizSpectrum.start();
    }

    // Stem waveforms
    const stemMap = {
      lead: this.dom.canvasStemLead,
      pad: this.dom.canvasStemPad,
      bass: this.dom.canvasStemBass,
      drums: this.dom.canvasStemDrums,
    };
    for (const [stem, canvas] of Object.entries(stemMap)) {
      if (canvas && this.engine.analysers[stem]) {
        const color = {
          lead: { r: 0, g: 240, b: 255, hex: '#00f0ff' },
          pad: { r: 139, g: 92, b: 246, hex: '#8b5cf6' },
          bass: { r: 255, g: 0, b: 229, hex: '#ff00e5' },
          drums: { r: 251, g: 191, b: 36, hex: '#fbbf24' },
        }[stem];
        this.vizStems[stem] = new WaveformVisualizer(canvas, this.engine.analysers[stem], color);
        this.vizStems[stem].start();
      }
    }

    // Piano roll
    if (this.dom.canvasPianoRoll) {
      this.vizPianoRoll = new PianoRollVisualizer(this.dom.canvasPianoRoll, this.sequencer);
      this.vizPianoRoll.start();
    }
  }

  // ── Latent Space Interaction ───────────────────────────

  _onLatentPositionChange(pos) {
    // Interpolate style parameters based on distance to each anchor
    const weights = {};
    let totalWeight = 0;
    for (const [name, anchor] of Object.entries(LATENT_ANCHORS)) {
      const dist = Math.hypot(pos.x - anchor.x, pos.y - anchor.y);
      const w = 1 / (dist * dist + 0.01);
      weights[name] = w;
      totalWeight += w;
    }

    // Normalize weights
    for (const name in weights) {
      weights[name] /= totalWeight;
    }

    // Interpolate parameters from presets
    const params = [
      'bpm', 'swing', 'density', 'phraseLength', 'leapProbability',
      'filterBrightness', 'filterResonance', 'reverbAmount', 'delayAmount',
    ];

    for (const param of params) {
      let val = 0;
      for (const [name, w] of Object.entries(weights)) {
        val += PRESETS[name][param] * w;
      }
      this.sequencer.style[param] = val;
    }

    // Pick scale and drum pattern from highest-weight preset
    let maxWeight = 0;
    let dominantPreset = 'jazz';
    for (const [name, w] of Object.entries(weights)) {
      if (w > maxWeight) {
        maxWeight = w;
        dominantPreset = name;
      }
    }
    this.sequencer.style.scale = PRESETS[dominantPreset].scale;
    this.sequencer.style.chordStyle = PRESETS[dominantPreset].chordStyle;
    this.sequencer.style.drumPattern = PRESETS[dominantPreset].drumPattern;
    this.sequencer.style.rootNote = PRESETS[dominantPreset].rootNote;

    // Update UI sliders
    this._syncSlidersFromStyle();
  }

  _syncSlidersFromStyle() {
    const s = this.sequencer.style;
    const set = (key, val) => {
      if (this.dom[key]) {
        this.dom[key].value = val;
        this.dom[key].dispatchEvent(new Event('input', { bubbles: false }));
      }
    };
    set('sliderBrightness', s.filterBrightness);
    set('sliderResonance', s.filterResonance);
    set('sliderBpm', s.bpm);
    set('sliderSwing', s.swing);
    set('sliderDensity', s.density);
    set('sliderPhrase', s.phraseLength);
    set('sliderLeap', s.leapProbability);
    set('sliderReverb', s.reverbAmount);
    set('sliderDelay', s.delayAmount);

    if (this.dom.selectScale) this.dom.selectScale.value = s.scale;
    if (this.dom.selectDrumPattern) this.dom.selectDrumPattern.value = s.drumPattern;
  }

  // ── Preset Application ─────────────────────────────────

  _applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    this.currentPreset = name;

    // Update active chip
    this.dom.presetChips.forEach(c => {
      c.classList.toggle('active', c.dataset.preset === name);
    });

    // Apply to sequencer
    Object.assign(this.sequencer.style, {
      bpm: preset.bpm,
      swing: preset.swing,
      density: preset.density,
      scale: preset.scale,
      rootNote: preset.rootNote,
      chordStyle: preset.chordStyle,
      phraseLength: preset.phraseLength,
      leapProbability: preset.leapProbability,
      octaveRange: preset.octaveRange,
      drumPattern: preset.drumPattern,
      filterBrightness: preset.filterBrightness,
      filterResonance: preset.filterResonance,
      reverbAmount: preset.reverbAmount,
      delayAmount: preset.delayAmount,
      padEnabled: preset.padEnabled,
      bassEnabled: preset.bassEnabled,
      drumsEnabled: preset.drumsEnabled,
      leadEnabled: preset.leadEnabled,
    });

    // Move latent grid
    if (this.vizLatentGrid && preset.latentPos) {
      this.vizLatentGrid.position = { ...preset.latentPos };
    }

    // Sync sliders
    this._syncSlidersFromStyle();

    // Regenerate source waveform for visual variety
    if (this.vizSourceWaveform) {
      this.vizSourceWaveform._generateWaveform();
    }

    this._log(`Preset loaded: ${preset.name}`);
  }

  // ── Analysis Flow ──────────────────────────────────────

  async _runAnalysis() {
    if (this.isAnalyzed) {
      this._log('Already analyzed. Change source to re-analyze.');
      return;
    }

    // Initialize audio engine on first user interaction
    await this.engine.init();
    await this.engine.resume();

    this.dom.btnAnalyze.disabled = true;
    this._log('Starting neural extraction pipeline...');

    // Call backend analysis API
    let analysisData = null;
    try {
      const sid = this.sessionId || 'preset-' + this.currentPreset;
      const res = await fetch(`${this.API_BASE}/analyze/${sid}`, { method: 'POST' });
      analysisData = await res.json();
    } catch (e) {
      // Continue even if backend is down
    }

    // Animated analysis steps
    const steps = Array.from(this.dom.analysisSteps);
    const stepLabels = [
      'Loading audio buffer & resampling...',
      'Running FFT spectral decomposition...',
      'Extracting instrument stems via NMF...',
      'Computing latent style embeddings...',
      'Building generative re-composition model...',
    ];

    for (let i = 0; i < steps.length; i++) {
      steps.forEach((s, j) => {
        s.classList.remove('active', 'done');
        if (j < i) s.classList.add('done');
        if (j === i) s.classList.add('active');
      });
      this._log(stepLabels[i] || `Step ${i + 1}...`);

      // Trigger scan on source waveform
      if (i === 0 && this.vizSourceWaveform) {
        this.vizSourceWaveform.startScan();
      }

      await this._sleep(800 + Math.random() * 600);
    }

    // Mark all done
    steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });

    this.isAnalyzed = true;

    // Log analysis results if available
    if (analysisData && analysisData.success) {
      const r = analysisData.analysis.results;
      this._log(`✓ Analysis complete. Spectral centroid: ${r.spectralCentroid.toFixed(0)}Hz | BPM est: ${r.estimatedBpm.toFixed(0)} | Stems: ${r.stems.length} detected`);
    } else {
      this._log('✓ Analysis complete. Style embeddings extracted. Ready to compose.');
    }

    // Start live visualizers
    this._startLiveVisualizers();

    // Enable play
    this.dom.btnPlay.disabled = false;
    this.dom.btnExport.disabled = false;

    // Flash status dots
    this.dom.statusDots.forEach(d => d.classList.add('on'));
  }

  // ── Playback ───────────────────────────────────────────

  async _togglePlayback() {
    if (!this.isAnalyzed) {
      this._log('Please analyze a source first.');
      return;
    }

    await this.engine.resume();

    if (this.isPlaying) {
      this._stopPlayback();
    } else {
      this._startPlayback();
    }
  }

  _startPlayback() {
    this.isPlaying = true;
    this.sequencer.clearLog();
    this.sequencer.start();
    this._updatePlayButton(true);
    this.dom.transportStatus.textContent = 'GENERATING';
    this._log('▶ Re-composition engine started. Generating new notes...');
    this._transportTick();

    // Log to backend
    this._apiLog('playback_started', { preset: this.currentPreset, ...this.sequencer.style });
  }

  _stopPlayback() {
    this.isPlaying = false;
    this.sequencer.stop();
    this._updatePlayButton(false);
    this.dom.transportStatus.textContent = 'STOPPED';
    this._log('⏹ Playback stopped.');
  }

  _updatePlayButton(playing) {
    const icon = this.dom.playIcon;
    if (playing) {
      // Pause icon (two bars)
      icon.innerHTML = '<rect x="6" y="4" width="3" height="12" rx="1"/><rect x="11" y="4" width="3" height="12" rx="1"/>';
    } else {
      // Play icon (triangle)
      icon.innerHTML = '<polygon points="6,4 16,10 6,16"/>';
    }
  }

  _transportTick() {
    if (!this.isPlaying) return;
    requestAnimationFrame(() => this._transportTick());

    const elapsed = this.sequencer.elapsedTime;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const ms = Math.floor((elapsed % 1) * 100);
    this.dom.transportTime.textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;

    // BPM display
    this.dom.transportBpm.innerHTML = `${Math.round(this.sequencer.style.bpm)}<span>BPM</span>`;

    // Progress bar (relative to 5 min = 300s)
    const progress = Math.min(100, (elapsed / 300) * 100);
    this.dom.progressFill.style.width = `${progress}%`;
  }

  _updateTransportDisplay() {
    this.dom.transportTime.textContent = '00:00.00';
    this.dom.transportStatus.textContent = 'IDLE';
    this.dom.transportBpm.innerHTML = `${Math.round(this.sequencer.style.bpm)}<span>BPM</span>`;
  }

  // ── File Upload ────────────────────────────────────────

  async _handleUpload(e) {
    const file = e.target.files[0];
    if (file) await this._processFile(file);
  }

  async _processFile(file) {
    if (!file.type.startsWith('audio/')) {
      this._log('⚠ Please upload an audio file (MP3, WAV, OGG).');
      return;
    }

    this._log(`Uploading: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    // Show file name in upload zone
    this.dom.uploadZone.querySelector('.upload-zone__text').textContent = file.name;

    // Upload to backend
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const uploadRes = await fetch(`${this.API_BASE}/upload`, { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.success) {
        this.sessionId = uploadData.session.id;
        this._log(`✓ Uploaded to server. Session: ${this.sessionId.slice(0, 8)}...`);
      }
    } catch (e) {
      this._log('Upload to backend skipped (standalone mode).');
    }

    // Decode audio locally for playback
    try {
      await this.engine.init();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.engine.ctx.decodeAudioData(arrayBuffer);
      this._log(`Decoded: ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch, ${audioBuffer.sampleRate}Hz`);

      // Set waveform from actual data
      if (this.vizSourceWaveform) {
        this.vizSourceWaveform.setAudioBuffer(audioBuffer);
      }

      // Reset analysis state
      this.isAnalyzed = false;
      this.dom.analysisSteps.forEach(s => s.classList.remove('active', 'done'));
      this.dom.btnAnalyze.disabled = false;
    } catch (err) {
      this._log(`⚠ Failed to decode audio: ${err.message}`);
    }
  }

  // ── Export ─────────────────────────────────────────────

  _openExportModal() {
    this.dom.modalOverlay.classList.add('open');
  }

  _closeExportModal() {
    this.dom.modalOverlay.classList.remove('open');
  }

  async _doExport() {
    const duration = parseInt(this.dom.modalDuration.value) || this.exportDuration;
    this._closeExportModal();
    this._log(`Rendering ${duration}s composition offline...`);

    // Ensure engine is ready
    await this.engine.init();

    try {
      const blob = await this.engine.exportWAV(
        (offEngine, offCtx) => {
          this.sequencer.renderOffline(offEngine, offCtx, duration);
        },
        duration
      );

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mimic-composition-${duration}s.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this._log(`✓ Export complete: mimic-composition-${duration}s.wav (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      this._log(`⚠ Export failed: ${err.message}`);
      console.error(err);
    }
  }

  // ── Logging ────────────────────────────────────────────

  _log(msg) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    if (this.dom.logLine) {
      this.dom.logLine.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="msg">${msg}</span>`;
    }
    console.log(`[MIMIC ${timestamp}] ${msg}`);
  }

  // ── Utility ────────────────────────────────────────────

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Log event to backend API (fire and forget) */
  _apiLog(event, params = {}) {
    fetch(`${this.API_BASE}/compositions/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        event,
        params,
        duration: this.sequencer.elapsedTime,
      }),
    }).catch(() => {}); // silent fail
  }
}

// ── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
