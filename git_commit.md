# Git Commit Schedule

This schedule breaks the repository work into 5 focused days so each commit stays small and reviewable.

## Day 1 - Project setup and server baseline

- Commit message: `chore: set up project baseline`
- Files:
  - `package.json`
  - `README.md`
  - `backend/server.js`
- Scope:
  - Confirm package metadata and scripts
  - Stabilize the Express server entry point
  - Document how to run the app locally

- Commands:
  ```bash
  git add package.json README.md backend/server.js
  git commit -m "chore: set up project baseline"
  git push origin main
  ```

## Day 2 - Frontend shell and layout

- Commit message: `feat: build frontend shell`
- Files:
  - `frontend/index.html`
  - `frontend/index.css`
  - `frontend/app.js`
- Scope:
  - Lay out the main UI structure
  - Add the base visual design and responsive styling
  - Wire the primary app controller to the page

- Commands:
  ```bash
  git add frontend/index.html frontend/index.css frontend/app.js
  git commit -m "feat: build frontend shell"
  git push origin main
  ```

## Day 3 - Audio engine and sequencing

- Commit message: `feat: add audio engine and sequencer`
- Files:
  - `frontend/audioEngine.js`
  - `frontend/sequencer.js`
- Scope:
  - Implement core Web Audio synthesis behavior
  - Add composition and note scheduling logic
  - Keep audio generation and sequencing responsibilities separate

- Commands:
  ```bash
  git add frontend/audioEngine.js frontend/sequencer.js
  git commit -m "feat: add audio engine and sequencer"
  git push origin main
  ```

## Day 4 - Visualization and interaction polish

- Commit message: `feat: add visualizers and interaction polish`
- Files:
  - `frontend/visualizers.js`
  - `frontend/app.js`
  - `frontend/index.css`
- Scope:
  - Add waveform, spectrum, and latent-space visual feedback
  - Improve UI interactions and state updates
  - Refine styling for clarity and usability

- Commands:
  ```bash
  git add frontend/visualizers.js frontend/app.js frontend/index.css
  git commit -m "feat: add visualizers and interaction polish"
  git push origin main
  ```

## Day 5 - Integration, cleanup, and release notes

- Commit message: `chore: finalize integration and documentation`
- Files:
  - `backend/server.js`
  - `frontend/app.js`
  - `README.md`
- Scope:
  - Connect frontend and backend behavior end to end
  - Clean up remaining edge cases and shared state handling
  - Update documentation with the final workflow and usage notes

- Commands:
  ```bash
  git add backend/server.js frontend/app.js README.md
  git commit -m "chore: finalize integration and documentation"
  git push origin main
  ```

## Suggested Commit Order

1. `chore: set up project baseline`
2. `feat: build frontend shell`
3. `feat: add audio engine and sequencer`
4. `feat: add visualizers and interaction polish`
5. `chore: finalize integration and documentation`

## Full Add, Commit, and Push Flow

If you want to run the whole sequence manually, use the commands below in order:

```bash
git add package.json README.md backend/server.js
git commit -m "chore: set up project baseline"
git push origin main

git add frontend/index.html frontend/index.css frontend/app.js
git commit -m "feat: build frontend shell"
git push origin main

git add frontend/audioEngine.js frontend/sequencer.js
git commit -m "feat: add audio engine and sequencer"
git push origin main

git add frontend/visualizers.js frontend/app.js frontend/index.css
git commit -m "feat: add visualizers and interaction polish"
git push origin main

git add backend/server.js frontend/app.js README.md
git commit -m "chore: finalize integration and documentation"
git push origin main
```

If your branch is not `main`, replace `main` with the branch you are using.
