# Ceremony

The capture client for a self-organizing markdown notebook, built from the design
handoff in `../design/design_handoff_ceremony/` (visual language after Peter Saville)
and the product plan in `../notebook-app-build-plan.md`.

You speak (or type) a brain-dump; an autonomous agent transcribes it, matches it
against the vault, and files it into topic pages — plain markdown in a git repo you
own. Reading happens in Obsidian; this app is only the instrument of capture, plus
the ledger (every agent commit), the code (topic → colour system), and the queue
(low-confidence filings awaiting judgement).

## Run

```sh
npm install
npm run dev
```

React + Vite PWA. Best experienced at phone width (≤430px); the shell centers itself
on wider screens. Live mic level + browser speech-recognition preview work in Chrome;
elsewhere capture falls back to the clearly-tagged SIMULATED mode.

## The backend is real

The app talks to the agent in `../agent` (FastAPI, port 8014; Vite proxies
`/api` in dev — see `src/api.js` for the contract). Topics, ledger, queue, and
recents all come from the vault; filing, refiling, rulings, recodes, and
reverts are git commits. Start the agent first or the app will tell you
"the agent is not listening."

The browser transcript (SpeechRecognition, Chrome-only) is the capture text
for voice takes; server-side Whisper transcription of recorded audio is the
planned upgrade. In browsers without it, voice capture degrades to the
clearly-tagged SIMULATED preview and typing always works.

## Still to build (tracked in the handoff README)

Offline capture queue in the service worker, mic-permission-denied mid-take,
network-failure states, very long takes, empty-vault first-run, >8-topic wheel
density, and push notification when a background filing lands.
