const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3',
                          'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/aac',
                          'audio/mp4', 'audio/x-m4a'];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  },
});

const sessions = new Map();

const PRESETS = {
  jazz: {
    id: 'jazz',
    name: 'Jazz Improvisation',
    description: 'Warm, woody timbre with swing rhythm and Dorian scale improvisation',
    icon: '🎷',
    params: {
      bpm: 105, swing: 0.55, density: 0.55, scale: 'dorian',
      rootNote: 60, chordStyle: 'jazz', phraseLength: 8,
      leapProbability: 0.25, octaveRange: 2, drumPattern: 'swing',
      filterBrightness: 0.45, filterResonance: 0.3,
      reverbAmount: 0.35, delayAmount: 0.2,
      padEnabled: true, bassEnabled: true, drumsEnabled: true, leadEnabled: true,
    },
    latentPos: { x: 0.2, y: 0.25 },
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave Horizon',
    description: 'Bright, modulated synths with driving rhythm and minor pentatonic arpeggios',
    icon: '🌃',
    params: {
      bpm: 118, swing: 0.0, density: 0.7, scale: 'minorPentatonic',
      rootNote: 57, chordStyle: 'pop', phraseLength: 4,
      leapProbability: 0.35, octaveRange: 2, drumPattern: 'driving',
      filterBrightness: 0.72, filterResonance: 0.5,
      reverbAmount: 0.25, delayAmount: 0.35,
      padEnabled: true, bassEnabled: true, drumsEnabled: true, leadEnabled: true,
    },
    latentPos: { x: 0.78, y: 0.22 },
  },
  classical: {
    id: 'classical',
    name: 'Classical Sonata',
    description: 'Resonant, pure tones with expressive timing and major scale complexity',
    icon: '🎻',
    params: {
      bpm: 90, swing: 0.1, density: 0.45, scale: 'major',
      rootNote: 60, chordStyle: 'pop', phraseLength: 8,
      leapProbability: 0.3, octaveRange: 3, drumPattern: 'sparse',
      filterBrightness: 0.55, filterResonance: 0.15,
      reverbAmount: 0.5, delayAmount: 0.1,
      padEnabled: true, bassEnabled: true, drumsEnabled: false, leadEnabled: true,
    },
    latentPos: { x: 0.25, y: 0.75 },
  },
  ambient: {
    id: 'ambient',
    name: 'Ambient Textures',
    description: 'Deep, reverberated textures with slow sparse rhythms and Lydian atmosphere',
    icon: '🌊',
    params: {
      bpm: 72, swing: 0.15, density: 0.25, scale: 'lydian',
      rootNote: 65, chordStyle: 'jazz', phraseLength: 16,
      leapProbability: 0.15, octaveRange: 2, drumPattern: 'sparse',
      filterBrightness: 0.35, filterResonance: 0.2,
      reverbAmount: 0.7, delayAmount: 0.45,
      padEnabled: true, bassEnabled: true, drumsEnabled: true, leadEnabled: true,
    },
    latentPos: { x: 0.75, y: 0.78 },
  },
};

const SCALES_INFO = {
  major:          { name: 'Major (Ionian)',      intervals: [0,2,4,5,7,9,11], mood: 'bright, happy' },
  minor:          { name: 'Natural Minor',       intervals: [0,2,3,5,7,8,10], mood: 'melancholic' },
  dorian:         { name: 'Dorian',              intervals: [0,2,3,5,7,9,10], mood: 'jazzy, soulful' },
  mixolydian:     { name: 'Mixolydian',          intervals: [0,2,4,5,7,9,10], mood: 'bluesy, rock' },
  lydian:         { name: 'Lydian',              intervals: [0,2,4,6,7,9,11], mood: 'dreamy, ethereal' },
  minorPentatonic:{ name: 'Minor Pentatonic',    intervals: [0,3,5,7,10],     mood: 'bluesy, versatile' },
  majorPentatonic:{ name: 'Major Pentatonic',    intervals: [0,2,4,7,9],      mood: 'folk, country' },
  blues:          { name: 'Blues',               intervals: [0,3,5,6,7,10],   mood: 'soulful, gritty' },
  phrygian:       { name: 'Phrygian',            intervals: [0,1,3,5,7,8,10], mood: 'dark, Spanish' },
  harmonicMinor:  { name: 'Harmonic Minor',      intervals: [0,2,3,5,7,8,11], mood: 'exotic, tense' },
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Latent Space Music Mimic',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
  });
});

// Get all presets
app.get('/api/presets', (req, res) => {
  res.json({ success: true, presets: Object.values(PRESETS) });
});

// Get single preset
app.get('/api/presets/:id', (req, res) => {
  const preset = PRESETS[req.params.id];
  if (!preset) {
    return res.status(404).json({ success: false, error: 'Preset not found' });
  }
  res.json({ success: true, preset });
});

// Get scale information
app.get('/api/scales', (req, res) => {
  res.json({ success: true, scales: SCALES_INFO });
});

// Upload audio file
app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No audio file provided' });
  }

  const sessionId = uuidv4();
  const fileInfo = {
    id: sessionId,
    originalName: req.file.originalname,
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
  };

  sessions.set(sessionId, { ...fileInfo, status: 'uploaded', analysis: null });
  console.log(`[UPLOAD] ${fileInfo.originalName} (${(fileInfo.size / 1024).toFixed(1)} KB) → session ${sessionId}`);
  res.json({ success: true, session: fileInfo });
});

// Analyze audio (simulated neural pipeline)
app.post('/api/analyze/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  const analysisId = session ? sessionId : uuidv4();

  console.log(`[ANALYZE] Starting analysis for session ${analysisId}`);

  const steps = [
    { name: 'audio_loading', label: 'Loading audio buffer & resampling', duration: 400 },
    { name: 'fft_decomposition', label: 'Running FFT spectral decomposition', duration: 600 },
    { name: 'stem_separation', label: 'Extracting instrument stems via NMF', duration: 800 },
    { name: 'latent_embedding', label: 'Computing latent style embeddings', duration: 500 },
    { name: 'model_building', label: 'Building generative re-composition model', duration: 400 },
  ];

  const analysis = {
    id: analysisId,
    completedAt: new Date().toISOString(),
    steps: steps.map(s => ({ ...s, status: 'completed' })),
    results: {
      spectralCentroid: 1200 + Math.random() * 3000,
      spectralRolloff: 4000 + Math.random() * 8000,
      zeroCrossingRate: 0.05 + Math.random() * 0.15,
      rmsEnergy: 0.1 + Math.random() * 0.4,
      estimatedBpm: 80 + Math.random() * 80,
      beatStrength: 0.3 + Math.random() * 0.7,
      swingAmount: Math.random() * 0.6,
      rhythmicComplexity: 0.2 + Math.random() * 0.6,
      brightness: 0.2 + Math.random() * 0.6,
      warmth: 0.3 + Math.random() * 0.5,
      roughness: Math.random() * 0.4,
      pitchRange: { low: 200 + Math.random() * 200, high: 800 + Math.random() * 2000 },
      melodicContour: Math.random() < 0.5 ? 'ascending' : 'descending',
      intervalDistribution: {
        unison: 0.05, second: 0.3, third: 0.25,
        fourth: 0.15, fifth: 0.1, sixth: 0.08,
        seventh: 0.05, octave: 0.02,
      },
      stems: [
        { name: 'lead', confidence: 0.85 + Math.random() * 0.15, frequency_range: '500Hz - 4kHz' },
        { name: 'harmony', confidence: 0.7 + Math.random() * 0.2, frequency_range: '200Hz - 2kHz' },
        { name: 'bass', confidence: 0.8 + Math.random() * 0.15, frequency_range: '40Hz - 300Hz' },
        { name: 'percussion', confidence: 0.75 + Math.random() * 0.2, frequency_range: 'broadband' },
      ],
      recommendedParams: {
        scale: ['dorian', 'minor', 'blues', 'minorPentatonic', 'major'][Math.floor(Math.random() * 5)],
        bpm: Math.round(80 + Math.random() * 80),
        density: 0.3 + Math.random() * 0.5,
        swing: Math.random() * 0.6,
        filterBrightness: 0.3 + Math.random() * 0.5,
        reverbAmount: 0.2 + Math.random() * 0.4,
      },
      latentVector: Array.from({ length: 8 }, () => Math.random() * 2 - 1),
      latentPosition: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 },
    },
  };

  if (session) {
    session.status = 'analyzed';
    session.analysis = analysis;
    sessions.set(sessionId, session);
  }

  console.log(`[ANALYZE] Complete for session ${analysisId}`);
  res.json({ success: true, analysis });
});

// Get session info
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  const all = Array.from(sessions.values()).map(s => ({
    id: s.id,
    originalName: s.originalName,
    status: s.status,
    uploadedAt: s.uploadedAt,
  }));
  res.json({ success: true, sessions: all });
});

// Log composition event
app.post('/api/compositions/log', (req, res) => {
  const { sessionId, event, params, duration } = req.body;
  console.log(`[COMPOSE] ${event} | session=${sessionId || 'preset'} | dur=${duration || 0}s`);
  res.json({
    success: true,
    logged: { event, timestamp: new Date().toISOString(), params: params || {} },
  });
});

// Interpolate latent position — compute blended style parameters from {x, y}
app.post('/api/latent/interpolate', (req, res) => {
  const { x, y } = req.body;
  if (x === undefined || y === undefined) {
    return res.status(400).json({ success: false, error: 'x and y position required' });
  }

  const presetEntries = Object.entries(PRESETS);
  let totalWeight = 0;
  const weights = {};

  for (const [name, preset] of presetEntries) {
    const dist = Math.hypot(x - preset.latentPos.x, y - preset.latentPos.y);
    const w = 1 / (dist * dist + 0.01);
    weights[name] = w;
    totalWeight += w;
  }

  for (const name in weights) {
    weights[name] /= totalWeight;
  }

  const numericParams = [
    'bpm', 'swing', 'density', 'phraseLength', 'leapProbability',
    'filterBrightness', 'filterResonance', 'reverbAmount', 'delayAmount',
    'octaveRange', 'rootNote',
  ];

  const interpolated = {};
  for (const param of numericParams) {
    let val = 0;
    for (const [name, w] of Object.entries(weights)) {
      val += PRESETS[name].params[param] * w;
    }
    interpolated[param] = Math.round(val * 100) / 100;
  }

  let maxWeight = 0;
  let dominant = 'jazz';
  for (const [name, w] of Object.entries(weights)) {
    if (w > maxWeight) { maxWeight = w; dominant = name; }
  }

  interpolated.scale = PRESETS[dominant].params.scale;
  interpolated.chordStyle = PRESETS[dominant].params.chordStyle;
  interpolated.drumPattern = PRESETS[dominant].params.drumPattern;
  interpolated.dominantPreset = dominant;
  interpolated.weights = weights;

  res.json({ success: true, position: { x, y }, interpolated });
});

// Delete session and cleanup uploaded file
app.delete('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const filePath = path.join(__dirname, 'uploads', session.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  sessions.delete(req.params.id);
  res.json({ success: true, deleted: req.params.id });
});

// Catch-all: serve frontend for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n  MIMIC Server running on http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
