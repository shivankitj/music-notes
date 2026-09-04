# MIMIC — Latent Space Music Transfer

An Audio-to-Audio Latent Style Transfer web application that analyzes audio clips and generates new compositions mimicking the original's timbre, rhythm, and melodic phrasing with entirely new notes.

---

## Project Structure

```
Music-notes/
├── package.json
├── README.md
├── backend/
│   ├── server.js          # Express API server
│   ├── uploads/           # Uploaded audio files
│   └── exports/           # Rendered exports
└── frontend/
    ├── index.html         # UI layout
    ├── index.css          # Styles
    ├── app.js             # Main controller
    ├── audioEngine.js     # Web Audio API synthesis
    ├── sequencer.js       # Generative composer
    └── visualizers.js     # Canvas visualizers
```

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher
- A modern browser (Chrome, Edge, Firefox, Safari)

---

## Installation

```bash
# 1. Clone or navigate to the project directory
cd Music-notes

# 2. Install dependencies
npm install
```

Create a `.env` file in the project root (next to `package.json`) from the included `.env.example`, then add your provider values. The server loads it automatically when it starts.

This installs:
- `express` — HTTP server and routing
- `multer` — Audio file upload handling
- `cors` — Cross-origin resource sharing
- `uuid` — Session ID generation

---

## Running the Application

### Start the server

```bash
npm start
```

This runs `node backend/server.js` and starts the Express server.

### Open in browser

```
http://localhost:3000
```

The Express server serves both the **API** and the **frontend** from a single process.

### Custom port

```bash
PORT=8080 npm start
```

---

## Backend API Reference

All endpoints are prefixed with `/api`.

| Method   | Endpoint                    | Description                              |
|----------|-----------------------------|------------------------------------------|
| `GET`    | `/api/health`               | Health check with uptime and status      |
| `GET`    | `/api/presets`              | List all 4 style presets                 |
| `GET`    | `/api/presets/:id`          | Get a single preset by ID                |
| `GET`    | `/api/scales`               | Get musical scale info (10 scales)       |
| `POST`   | `/api/upload`               | Upload an audio file (multipart form)    |
| `POST`   | `/api/separate/:sessionId`  | Proxy a configured hosted stem separator |
| `POST`   | `/api/analyze/:sessionId`   | Run analysis pipeline on a session       |
| `GET`    | `/api/sessions`             | List all upload sessions                 |
| `GET`    | `/api/sessions/:id`         | Get session details                      |
| `DELETE` | `/api/sessions/:id`         | Delete session and uploaded file         |
| `POST`   | `/api/latent/interpolate`   | Compute interpolated params from {x, y}  |
| `POST`   | `/api/compositions/log`     | Log a composition event                  |

### Example: Health Check

```bash
curl http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "service": "Latent Space Music Mimic",
  "version": "1.0.0",
  "uptime": 42.5,
  "timestamp": "2026-06-03T02:49:37.247Z",
  "activeSessions": 0
}
```

### Example: Upload Audio

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "audio=@myfile.wav"
```

### Example: Latent Interpolation

```bash
curl -X POST http://localhost:3000/api/latent/interpolate \
  -H "Content-Type: application/json" \
  -d '{"x": 0.5, "y": 0.5}'
```

---

## Frontend Usage

1. **Select a preset** — Click one of the 4 style chips (Jazz, Synthwave, Classical, Ambient) or upload your own audio file
2. **Analyze** — Click "Analyze & Separate" to run the extraction pipeline
3. **Play** — Press the play button (or `Space` bar) to start generating music
4. **Morph styles** — Drag the node in the Latent Space grid to blend between styles in real-time
5. **Fine-tune** — Adjust sliders for brightness, BPM, swing, density, scale, reverb, delay, etc.
6. **Export** — Click "Export WAV" to render a composition (10s to 5min) and download it
7. **Extract tracks** — After uploading, download a vocal-reduced, bass, instrument, or percussion WAV. The hosted provider is used when configured; otherwise the browser renderer is used.

---

## Frontend Architecture

| File             | Purpose                                                    |
|------------------|------------------------------------------------------------|
| `app.js`         | Main controller — UI binding, presets, upload, export      |
| `audioEngine.js` | Web Audio API — Lead, Pad, Bass, Drums synthesis + effects |
| `sequencer.js`   | Generative composer — Markov chains, scale walker          |
| `visualizers.js` | Canvas rendering — waveforms, spectrum, latent grid, piano roll |

### Synthesis Engine

- **Lead**: Dual detuned oscillators (sawtooth + triangle) with lowpass filter and ADSR envelope
- **Pad**: Multi-voice triangle oscillators with slow attack
- **Bass**: Sine + triangle sub-bass with filter envelope
- **Drums**: Kick (sine pitch sweep), Snare (noise + body), Hi-Hat (highpass noise)
- **Effects**: Convolution reverb (2.5s impulse), feedback delay, dynamics compressor

### Generative Composer

- Markov chain chord progressions (Jazz: ii-V-I patterns, Pop: I-IV-V-vi)
- Probabilistic scale walker with configurable leap probability
- 10 musical scales, 5 drum patterns, 16th-note lookahead scheduler with swing

---

## Deployment

### Production with PM2

```bash
npm install -g pm2
pm2 start backend/server.js --name mimic
pm2 save
```

### Behind Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name mimic.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Environment Variables

| Variable | Default | Description        |
|----------|---------|--------------------|
| `PORT`   | `3000`  | Server listen port |
| `AUDIOSHAKE_API_URL` | `https://api.audioshake.ai` | AudioShake API base URL. |
| `STEM_API_KEY` | unset | AudioShake API key sent as `x-api-key`. Keep this server-side. |

The hosted endpoint should return an audio file (WAV/MP3) in its response body. Configure a provider with:

```bash
AUDIOSHAKE_API_URL=https://api.audioshake.ai STEM_API_KEY=your-token npm start
```

AudioShake processing is asynchronous and may take up to two minutes. Without `STEM_API_KEY`, extraction still works locally. Vocal removal uses stereo center cancellation; bass, instruments, and percussion use frequency-isolation filters.

Uploaded source files are created in `backend/uploads/` after a successful upload. The current composition and stem downloads are generated in the browser and downloaded directly, so `backend/exports/` remains empty unless a future server-side export route is added.

---

## License

MIT
