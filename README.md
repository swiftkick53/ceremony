# Ceremony — a self-organizing markdown notebook

Speak (or type) a brain-dump; an agent files it into a wiki of plain markdown
you own, in a git repo, one commit per action. Read the vault in Obsidian.

Built from `notebook-app-build-plan.md` and the design handoff in
`design/design_handoff_ceremony/` (visual language after Peter Saville).

## The pieces

| Directory   | What it is |
|-------------|------------|
| `ceremony/` | The capture client — React PWA (Vite). Capture wheel, ledger, code, queue. |
| `agent/`    | The agent — Python/FastAPI. Owns the vault, decides where dumps go, commits. |
| `vault/`    | Your notebook — plain markdown in a git repo. Open it in Obsidian. |

## Run it

```sh
# 1. the agent (owns the vault; creates it on first run)
cd agent
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
.venv/bin/uvicorn main:app --port 8014

# 2. the capture client
cd ceremony
npm install        # first time
npm run dev        # → http://localhost:5173
```

## The brain

The agent files with **Claude** (`claude-opus-4-8`) when API credentials are
available — set `ANTHROPIC_API_KEY` (or log in with `ant auth login`) before
starting the agent. Claude reads the vault's topics and recent notes, cleans
the transcription without inventing anything, estimates its own confidence,
and extracts `//research` flags.

Without credentials it falls back to a lexical matcher whose confidence is
deliberately capped **below** the 0.75 filing bar — a keyword matcher should
never file on its own — so every dump goes to the Queue for your judgement.
The pipe still works end to end; it just always asks.

Knobs (env vars for the agent): `CEREMONY_VAULT` (vault path),
`CEREMONY_CONFIDENCE` (filing bar, default 0.75), `CEREMONY_MODEL`.

## How filing works

1. The raw dump lands in `vault/inbox/` untouched — nothing is ever lost.
2. The brain matches it against every topic page and decides: file (≥ 0.75
   confidence), or hold for judgement in the Queue.
3. Filed notes are appended to the topic page's `## Notes`; `//research`
   flags land in `## Research`; every page keeps a `## Log`.
4. One git commit per action, tagged with `Ceremony-*` trailers. The Ledger
   screen is parsed `git log`; revert is `git revert`; the topic→colour map
   lives in `vault/code.yml` so Obsidian theming can share it.

## Still to build (per the plan's later phases)

- Server-side Whisper transcription (the browser transcript is Chrome-only).
- Actual web research answering the `//research` queue (Phase 4).
- Nightly reweave: dedup, backlinks, consolidation, weekly digest (Phase 3/5).
- Offline capture queue in the PWA service worker; push notifications.
- Hosting the agent on an always-on box so phone dumps file with the laptop shut.
