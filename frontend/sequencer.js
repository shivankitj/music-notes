// sequencer.js — Generative Music Sequencer
// Markov chain chord progressions, probabilistic melody walker,
// configurable rhythm patterns, real-time parameter morphing.

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/** Scale intervals in semitones from root */
const SCALES = {
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  lydian:         [0, 2, 4, 6, 7, 9, 11],
  minorPentatonic:[0, 3, 5, 7, 10],
  majorPentatonic:[0, 2, 4, 7, 9],
  blues:          [0, 3, 5, 6, 7, 10],
  phrygian:       [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
};

/** Chord quality intervals */
const CHORD_TYPES = {
  maj:   [0, 4, 7],
  min:   [0, 3, 7],
  dom7:  [0, 4, 7, 10],
  min7:  [0, 3, 7, 10],
  maj7:  [0, 4, 7, 11],
  dim:   [0, 3, 6],
  sus4:  [0, 5, 7],
  add9:  [0, 2, 4, 7],
};

/** Markov transition matrices for chord progressions (scale degree index, 0-based) */
const CHORD_MARKOV = {
  jazz: {
    // ii -> V -> I -> vi heavy jazz movement
    0: [{ to: 3, w: 0.3 }, { to: 4, w: 0.25 }, { to: 5, w: 0.2 }, { to: 1, w: 0.15 }, { to: 2, w: 0.1 }],
    1: [{ to: 4, w: 0.45 }, { to: 0, w: 0.2 }, { to: 3, w: 0.2 }, { to: 5, w: 0.15 }],
    2: [{ to: 5, w: 0.3 }, { to: 3, w: 0.3 }, { to: 0, w: 0.2 }, { to: 1, w: 0.2 }],
    3: [{ to: 0, w: 0.15 }, { to: 4, w: 0.35 }, { to: 6, w: 0.15 }, { to: 1, w: 0.2 }, { to: 5, w: 0.15 }],
    4: [{ to: 0, w: 0.5 }, { to: 5, w: 0.2 }, { to: 3, w: 0.15 }, { to: 1, w: 0.15 }],
    5: [{ to: 1, w: 0.3 }, { to: 3, w: 0.25 }, { to: 4, w: 0.25 }, { to: 0, w: 0.2 }],
    6: [{ to: 0, w: 0.4 }, { to: 4, w: 0.3 }, { to: 3, w: 0.3 }],
  },
  pop: {
    0: [{ to: 4, w: 0.3 }, { to: 3, w: 0.3 }, { to: 5, w: 0.2 }, { to: 1, w: 0.2 }],
    1: [{ to: 4, w: 0.4 }, { to: 0, w: 0.3 }, { to: 3, w: 0.3 }],
    2: [{ to: 0, w: 0.3 }, { to: 3, w: 0.35 }, { to: 5, w: 0.35 }],
    3: [{ to: 4, w: 0.4 }, { to: 0, w: 0.3 }, { to: 5, w: 0.3 }],
    4: [{ to: 0, w: 0.4 }, { to: 5, w: 0.3 }, { to: 3, w: 0.3 }],
    5: [{ to: 3, w: 0.35 }, { to: 4, w: 0.35 }, { to: 0, w: 0.3 }],
    6: [{ to: 0, w: 0.5 }, { to: 4, w: 0.5 }],
  },
};

/** Rhythm pattern templates (1 = hit, 0 = rest). Each is one bar of 16th-notes */
const DRUM_PATTERNS = {
  straight: {
    kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  swing: {
    kick:   [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare:  [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
    hihat:  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,1],
  },
  sparse: {
    kick:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
  },
  driving: {
    kick:   [1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,0],
    snare:  [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
    hihat:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  syncopated: {
    kick:   [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare:  [0,0,1,0, 1,0,0,0, 0,0,1,0, 0,1,0,0],
    hihat:  [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,0],
  },
};

────

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function pickWeighted(transitions) {
  const r = Math.random();
  let sum = 0;
  for (const t of transitions) {
    sum += t.w;
    if (r <= sum) return t.to;
  }
  return transitions[transitions.length - 1].to;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

────

export class Sequencer {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.isPlaying = false;
    this.schedulerTimer = null;
    this.currentStep = 0;    // global 16th-note step count
    this.nextNoteTime = 0;   // next scheduled note in audio time
    this.startTime = 0;

    // Listeners for visual updates
    this._onNote = null;     // callback(noteEvent)
    this._onStep = null;     // callback(stepIndex, time)
    this._onBeat = null;     // callback(beatIndex)


    this.style = {
      bpm: 110,
      swing: 0.0,          // 0 = straight, 1 = full triplet swing
      density: 0.6,        // 0-1, controls how many notes fire
      scale: 'dorian',
      rootNote: 60,        // MIDI root (C4)
      chordStyle: 'jazz',  // Markov matrix to use
      phraseLength: 8,     // beats per phrase
      leapProbability: 0.2,// chance of a large interval jump
      octaveRange: 2,      // octaves above root for melody
      drumPattern: 'swing',
      padEnabled: true,
      bassEnabled: true,
      drumsEnabled: true,
      leadEnabled: true,
      // Timbre-related (forwarded to audioEngine)
      filterBrightness: 0.5, // 0-1, maps to cutoff
      filterResonance: 0.3,
      reverbAmount: 0.3,
      delayAmount: 0.2,
    };

    // Internal generative state
    this._currentChordDegree = 0;
    this._melodyNote = 0;  // index in scale
    this._melodyOctave = 0;
    this._phraseStep = 0;
    this._chordHoldSteps = 0;
    this._currentChordFreqs = [];
    this._bassNote = 0;

    // Note log for piano roll visualization
    this.noteLog = []; // { stem, freq, time, duration, midi }
    this._maxLogSize = 2000;
  }

  /** Register callbacks */
  onNote(fn) { this._onNote = fn; }
  onStep(fn) { this._onStep = fn; }
  onBeat(fn) { this._onBeat = fn; }



  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this._phraseStep = 0;
    this._currentChordDegree = 0;
    this._melodyNote = 2; // start on 3rd scale degree
    this._melodyOctave = 0;
    this.nextNoteTime = this.engine.currentTime + 0.05;
    this.startTime = this.engine.currentTime;
    this._scheduleLoop();
  }

  stop() {
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  get elapsedTime() {
    if (!this.isPlaying) return 0;
    return this.engine.currentTime - this.startTime;
  }

──

  _scheduleLoop() {
    const lookahead = 0.1;   // schedule 100ms ahead
    const interval = 25;     // check every 25ms

    this.schedulerTimer = setInterval(() => {
      if (!this.isPlaying) return;
      while (this.nextNoteTime < this.engine.currentTime + lookahead) {
        this._processStep(this.currentStep, this.nextNoteTime);
        this._advanceStep();
      }
    }, interval);
  }

  _advanceStep() {
    const secondsPer16th = (60 / this.style.bpm) / 4;
    // Apply swing to odd 16th notes
    const isOdd = this.currentStep % 2 === 1;
    let stepDur = secondsPer16th;
    if (isOdd && this.style.swing > 0) {
      stepDur *= (1 + this.style.swing * 0.6);
    } else if (!isOdd && this.style.swing > 0) {
      stepDur *= (1 - this.style.swing * 0.3);
    }
    this.nextNoteTime += stepDur;
    this.currentStep++;
    this._phraseStep++;
  }

──

  _processStep(step, time) {
    const beatInBar = (step % 16);  // 0-15 within a bar
    const barBeat = Math.floor(beatInBar / 4); // 0-3 quarter note

    // Notify step
    if (this._onStep) this._onStep(step, time);
    if (beatInBar % 4 === 0 && this._onBeat) this._onBeat(step / 4);

    // Update engine parameters from style
    this._syncEngineParams();

    // ── Chord changes (every phrase)
    const stepsPerPhrase = this.style.phraseLength * 4; // in 16th notes
    if (this._phraseStep >= stepsPerPhrase) {
      this._phraseStep = 0;
      this._advanceChord();
    }

    // Build current chord if needed
    if (this._chordHoldSteps <= 0) {
      this._buildChord();
      // Hold for half or full phrase
      this._chordHoldSteps = Math.random() < 0.4
        ? stepsPerPhrase
        : Math.floor(stepsPerPhrase / 2);
    }
    this._chordHoldSteps--;

    // ── Pad (chord sustain) — trigger at chord change
    if (this.style.padEnabled && this._chordHoldSteps === (Math.random() < 0.4 ? stepsPerPhrase - 1 : Math.floor(stepsPerPhrase / 2) - 1)) {
      // We'll just trigger pad on phrase boundaries
    }
    // Trigger pad at start of each chord hold
    if (this.style.padEnabled && (this._phraseStep === 0 || this._phraseStep === Math.floor(stepsPerPhrase / 2))) {
      if (beatInBar === 0) {
        const holdDur = (60 / this.style.bpm) * this.style.phraseLength * 0.45;
        this.engine.playPad(this._currentChordFreqs, time, holdDur);
        this._logNote('pad', this._currentChordFreqs[0], time, holdDur);
      }
    }

    // ── Bass — plays root of chord on beats 1 and 3, with occasional walking
    if (this.style.bassEnabled && beatInBar % 4 === 0) {
      const bassFreq = this._currentChordFreqs[0] / 2; // one octave down
      const dur = (60 / this.style.bpm) * 0.9;
      this.engine.playBass(bassFreq, time, dur);
      this._logNote('bass', bassFreq, time, dur);
    }
    // Walking bass on beat 2 and 4 occasionally
    if (this.style.bassEnabled && beatInBar % 4 === 2 && Math.random() < this.style.density * 0.6) {
      const scaleNotes = this._getScaleNotes();
      const walkIdx = (this._currentChordDegree + (Math.random() < 0.5 ? 2 : 4)) % scaleNotes.length;
      const walkFreq = midiToFreq(scaleNotes[walkIdx]) / 2;
      const dur = (60 / this.style.bpm) * 0.4;
      this.engine.playBass(walkFreq, time, dur);
      this._logNote('bass', walkFreq, time, dur);
    }

    // ── Lead Melody — probabilistic scale walking
    if (this.style.leadEnabled) {
      this._processLeadStep(beatInBar, time);
    }

    // ── Drums
    if (this.style.drumsEnabled) {
      this._processDrumStep(beatInBar, time);
    }
  }



  _processLeadStep(beatInBar, time) {
    // Determine if we play a note on this 16th step
    // Higher density = more notes
    const shouldPlay = this._shouldLeadPlay(beatInBar);
    if (!shouldPlay) return;

    const scaleNotes = this._getScaleNotes();
    const scaleLen = scaleNotes.length;

    // Walk melody
    if (Math.random() < this.style.leapProbability) {
      // Large interval leap
      this._melodyNote = (this._melodyNote + (Math.random() < 0.5 ? 3 : 4)) % scaleLen;
      if (Math.random() < 0.3) {
        this._melodyOctave = clamp(this._melodyOctave + (Math.random() < 0.5 ? 1 : -1), 0, this.style.octaveRange);
      }
    } else {
      // Stepwise motion
      const dir = Math.random() < 0.55 ? 1 : -1;
      this._melodyNote += dir;
      if (this._melodyNote >= scaleLen) {
        this._melodyNote = 0;
        this._melodyOctave = Math.min(this._melodyOctave + 1, this.style.octaveRange);
      } else if (this._melodyNote < 0) {
        this._melodyNote = scaleLen - 1;
        this._melodyOctave = Math.max(this._melodyOctave - 1, 0);
      }
    }

    const midi = scaleNotes[this._melodyNote] + this._melodyOctave * 12;
    const freq = midiToFreq(midi);

    // Note duration: sometimes short (16th), sometimes longer (8th, quarter)
    const baseDur = (60 / this.style.bpm) / 4;
    let dur;
    const r = Math.random();
    if (r < 0.3) dur = baseDur * 0.8;         // short 16th
    else if (r < 0.7) dur = baseDur * 1.8;    // 8th note
    else dur = baseDur * 3.5;                  // quarter-ish

    // Vary waveform based on brightness
    const waveform = this.style.filterBrightness > 0.6 ? 'sawtooth' : 'triangle';

    this.engine.playLead(freq, time, dur, { waveform });
    this._logNote('lead', freq, time, dur, midi);

    if (this._onNote) {
      this._onNote({ stem: 'lead', freq, time, duration: dur, midi });
    }
  }

  _shouldLeadPlay(beatInBar) {
    // On strong beats (0, 4, 8, 12) always likely
    if (beatInBar % 4 === 0) return Math.random() < 0.85;
    // On "and" beats (2, 6, 10, 14) moderate
    if (beatInBar % 2 === 0) return Math.random() < this.style.density * 0.7;
    // On offbeats — density dependent
    return Math.random() < this.style.density * 0.35;
  }



  _processDrumStep(beatInBar, time) {
    const pattern = DRUM_PATTERNS[this.style.drumPattern] || DRUM_PATTERNS.straight;

    if (pattern.kick[beatInBar]) {
      // Slight velocity variation
      this.engine.playDrum('kick', time, 0.7 + Math.random() * 0.2);
      this._logNote('drums', 60, time, 0.1);
    }
    if (pattern.snare[beatInBar]) {
      this.engine.playDrum('snare', time, 0.6 + Math.random() * 0.25);
      this._logNote('drums', 72, time, 0.08);
    }
    if (pattern.hihat[beatInBar]) {
      // Occasionally open hat
      const isOpen = Math.random() < 0.1;
      this.engine.playDrum(isOpen ? 'openhat' : 'hihat', time, 0.4 + Math.random() * 0.3);
      this._logNote('drums', 84, time, isOpen ? 0.12 : 0.04);
    }

    // Ghost notes at high density
    if (this.style.density > 0.65 && Math.random() < 0.15) {
      const ghostTime = time + (60 / this.style.bpm) / 8;
      this.engine.playDrum('hihat', ghostTime, 0.15 + Math.random() * 0.1);
    }
  }

──

  _advanceChord() {
    const markov = CHORD_MARKOV[this.style.chordStyle] || CHORD_MARKOV.jazz;
    const transitions = markov[this._currentChordDegree] || markov[0];
    this._currentChordDegree = pickWeighted(transitions);
  }

  _buildChord() {
    const scaleNotes = this._getScaleNotes();
    const root = scaleNotes[this._currentChordDegree % scaleNotes.length];

    // Determine chord quality based on scale position
    const degree = this._currentChordDegree;
    let quality;
    if (this.style.chordStyle === 'jazz') {
      quality = [0, 3, 5].includes(degree) ? 'maj7' : [1, 2].includes(degree) ? 'min7' : degree === 4 ? 'dom7' : 'min7';
    } else {
      quality = [0, 3, 4].includes(degree) ? 'maj' : [1, 2, 5].includes(degree) ? 'min' : 'dim';
    }

    const intervals = CHORD_TYPES[quality] || CHORD_TYPES.maj;
    this._currentChordFreqs = intervals.map(i => midiToFreq(root + i));
    this._bassNote = root;
  }



  _getScaleNotes() {
    const rootMidi = this.style.rootNote;
    const scale = SCALES[this.style.scale] || SCALES.dorian;
    return scale.map(s => rootMidi + s);
  }



  _logNote(stem, freq, time, duration, midi) {
    const note = {
      stem,
      freq,
      time: time - this.startTime,
      duration,
      midi: midi || Math.round(freqToMidi(freq)),
    };
    this.noteLog.push(note);
    if (this.noteLog.length > this._maxLogSize) {
      this.noteLog.splice(0, this.noteLog.length - this._maxLogSize);
    }
  }

  clearLog() {
    this.noteLog = [];
  }



  _syncEngineParams() {
    // Map brightness 0-1 to filter cutoff 300-8000 Hz
    const cutoff = 300 + this.style.filterBrightness * 7700;
    this.engine.setFilterCutoff(cutoff);
    this.engine.setFilterRes(1 + this.style.filterResonance * 12);
    this.engine.setReverbMix(this.style.reverbAmount);
    this.engine.setDelayMix(this.style.delayAmount);
  }



  /**
   * Schedule all notes for offline rendering
   * @param {OfflineEngine} offEngine
   * @param {OfflineAudioContext} offCtx
   * @param {number} durationSec
   */
  renderOffline(offEngine, offCtx, durationSec) {
    const bpm = this.style.bpm;
    const secondsPer16th = (60 / bpm) / 4;
    const totalSteps = Math.floor(durationSec / secondsPer16th);
    let time = 0;
    let phraseStep = 0;
    let chordDegree = 0;
    let melNote = 2;
    let melOctave = 0;
    let chordHold = 0;
    let chordFreqs = [];
    const stepsPerPhrase = this.style.phraseLength * 4;
    const scaleNotes = this._getScaleNotes();
    const scaleLen = scaleNotes.length;
    const markov = CHORD_MARKOV[this.style.chordStyle] || CHORD_MARKOV.jazz;
    const pattern = DRUM_PATTERNS[this.style.drumPattern] || DRUM_PATTERNS.straight;

    const buildChord = () => {
      const root = scaleNotes[chordDegree % scaleLen];
      const quality = [0, 3, 5].includes(chordDegree) ? 'maj7' : [1, 2].includes(chordDegree) ? 'min7' : chordDegree === 4 ? 'dom7' : 'min7';
      const intervals = CHORD_TYPES[quality] || CHORD_TYPES.maj;
      chordFreqs = intervals.map(i => midiToFreq(root + i));
    };

    buildChord();

    for (let step = 0; step < totalSteps; step++) {
      const beatInBar = step % 16;

      // Chord progression
      if (phraseStep >= stepsPerPhrase) {
        phraseStep = 0;
        const trans = markov[chordDegree] || markov[0];
        chordDegree = pickWeighted(trans);
        buildChord();
      }

      // Pad
      if (this.style.padEnabled && phraseStep === 0 && beatInBar === 0) {
        const holdDur = (60 / bpm) * this.style.phraseLength * 0.45;
        offEngine.playPad(chordFreqs, time, holdDur);
      }

      // Bass
      if (this.style.bassEnabled && beatInBar % 4 === 0) {
        const bassFreq = chordFreqs[0] / 2;
        offEngine.playBass(bassFreq, time, (60 / bpm) * 0.9);
      }

      // Lead
      if (this.style.leadEnabled) {
        let shouldPlay = false;
        if (beatInBar % 4 === 0) shouldPlay = Math.random() < 0.85;
        else if (beatInBar % 2 === 0) shouldPlay = Math.random() < this.style.density * 0.7;
        else shouldPlay = Math.random() < this.style.density * 0.35;

        if (shouldPlay) {
          if (Math.random() < this.style.leapProbability) {
            melNote = (melNote + (Math.random() < 0.5 ? 3 : 4)) % scaleLen;
          } else {
            melNote += Math.random() < 0.55 ? 1 : -1;
            if (melNote >= scaleLen) { melNote = 0; melOctave = Math.min(melOctave + 1, this.style.octaveRange); }
            if (melNote < 0) { melNote = scaleLen - 1; melOctave = Math.max(melOctave - 1, 0); }
          }
          const midi = scaleNotes[melNote] + melOctave * 12;
          const freq = midiToFreq(midi);
          const baseDur = secondsPer16th;
          const r = Math.random();
          const dur = r < 0.3 ? baseDur * 0.8 : r < 0.7 ? baseDur * 1.8 : baseDur * 3.5;
          offEngine.playLead(freq, time, dur);
        }
      }

      // Drums
      if (this.style.drumsEnabled) {
        if (pattern.kick[beatInBar]) offEngine.playDrum('kick', time, 0.7 + Math.random() * 0.2);
        if (pattern.snare[beatInBar]) offEngine.playDrum('snare', time, 0.65);
        if (pattern.hihat[beatInBar]) offEngine.playDrum('hihat', time, 0.45);
      }

      // Advance time
      const isOdd = step % 2 === 1;
      let stepDur = secondsPer16th;
      if (isOdd && this.style.swing > 0) stepDur *= (1 + this.style.swing * 0.6);
      else if (!isOdd && this.style.swing > 0) stepDur *= (1 - this.style.swing * 0.3);
      time += stepDur;
      phraseStep++;
    }
  }
}

export { SCALES, NOTE_NAMES, DRUM_PATTERNS, midiToFreq };
