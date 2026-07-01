# Handoff: Ceremony — a self-organizing markdown notebook (capture client)

## Overview
Ceremony is the phone-first capture client for a self-organizing markdown notebook. The user speaks (or types) a brain-dump; an autonomous agent transcribes it, matches it against the vault, and files it into topic pages — plain markdown in a git repo the user owns. Reading happens in Obsidian; this app is only the instrument of capture, plus a window into what the agent did (ledger), the topic→colour system (code), and a review queue for low-confidence filings.

Visual language: after Peter Saville (Factory Records) — austere bone/ink surfaces, a coded colour system where colour IS the filing metadata, classical serif + geometric sans + technical mono.

See `notebook-app-build-plan.md` (included) for the full product/agent architecture this UI was designed against.

## About the Design Files
The files in this bundle are **design references created in HTML** (`Ceremony v3 — App.dc.html` + its runtime `support.js`). They are working prototypes showing intended look and behavior — **not production code to copy directly**. The task is to recreate this design in the target codebase's environment (React/Vue/Svelte/native…) using its established patterns; if no codebase exists yet, choose an appropriate stack (a PWA-capable web framework is the natural fit — the plan calls for a phone PWA).

The prototype file is self-contained: open it in a browser to interact with every state. The logic lives in a `<script data-dc-script>` class at the bottom of the file; the markup (with all exact inline styles) is inside `<x-dc>`.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copywriting, and interaction choreography are final design intent. Recreate pixel-perfectly. The only simulated parts are backend behaviors (see "What the real build still needs").

## App shell
- Max width 430px, full-height column: header (fixed) / screen (scroll) / bottom nav (fixed).
- Header: 1px bottom hairline `oklch(0.2 0.01 70 / 0.12)`; centered wordmark CEREMONY (Jost 10px, letter-spacing 0.34em, uppercase, `oklch(0.55 0.01 70)`); right-aligned clock (Space Mono 10px). Left side is an empty 36px spacer (a catalog number was removed by design decision — keep it empty).
- Bottom nav: 4 items (CAPTURE / LEDGER / CODE / QUEUE), Jost 11px letter-spacing 0.2em; active item marked by a 26×2px ink bar above the label; ≥44px targets (padding 15px/17px). QUEUE carries a 15×15px red badge (Space Mono 9px) with pending count. While recording, CAPTURE shows a pulsing violet 6px dot + live timer (Space Mono 9px violet) even from other screens.
- Toast: floats 82px above bottom, ink background, bone text (Space Mono 10.5px), optional UNDO button (bordered, Jost 10px). Auto-dismisses after 3.5s (4s when it carries UNDO).

## Screens

### 1. Capture (default)
- Heading area (Bodoni Moda 33px, weight 500): idle "Speak, and it is filed." / recording: elapsed timer (Space Mono 33px) + LISTENING (Jost 11px, letter-spacing 0.3em, violet) + mic-mode tag (Space Mono 9px: LIVE MIC or SIMULATED) / processing: italic 28px "Reading the vault…" / routed: "Filed."
- **The wheel**: SVG ~300×300. n topic segments (donut, outer R 128 / inner r 62 in a 320 viewBox), each filled with its topic colour, 2px bone strokes, segment opacity 0.34 at rest. Outer hairline ring (ink, 0.5 opacity) + 24 tick marks. While recording: inner wheel rotates +0.8°/tick (50ms), outer ring counter-rotates at half speed; the segment indexed by audio level goes opacity 1 (others 0.22) with a 0.6s opacity cross-fade — level is eased toward a target (lerp factor 0.09), never jumpy. When routed: destination segment lit, plus a 4px dot on the rim at its mid-angle.
- Hub button (112px circle, centered over wheel): BEGIN (bone bg, 1px ink border; inverts on hover) → END (violet `oklch(0.55 0.15 300)`, bone text) → processing: dashed-border disc "38 PAGES" pulsing → AGAIN.
- Recording: transcript streams below in Bodoni Moda 16px/1.55, fixed 118px window (newest lines visible, column-reverse), violet caret ▍. Below it: full-width bordered button "ABANDON TAKE — NOTHING FILED".
- Processing: mono status lines (`· matching against 38 pages` / `· nearest [[attention-essay]] 0.89` / `· action append + //research`) + "FILE IN BACKGROUND" button → returns to idle, toast "filing in background…", later "filed to studio — see the ledger".
- Routed: bordered card — "FILED TO" label; tappable topic row (15px colour chip + Bodoni 23px topic name + underlined CHANGE) which opens a chip picker of the other topics (refile in place); italic excerpt of the dump (real transcript when live mic was used); //research row (8px red dot + mono line); footer `commit a3f9c1` + underlined `⤺ revert`. Entering this state also fires the "committed a3f9c1 — UNDO" toast (4s).
- Idle: full-width bordered "TYPE INSTEAD" button, then "RECENTLY FILED" list (10px colour chip, Bodoni 15px snippet ellipsized, Space Mono 9.5px time).
- Type path: 180px textarea (Bodoni Moda 17px on `oklch(0.97 0.008 85)`), CANCEL (bordered) + FILE IT (ink, flex-1).

### 2. Ledger
- Heading "The ledger." + subline "Every act of the agent, committed. Nothing is lost." (Jost 12.5px, `oklch(0.48 0.01 70)`).
- Day groups (TODAY / YESTERDAY / SUNDAY — Jost 9.5px, letter-spacing 0.3em, hairline underline). Entries: 11px colour chip; verb tag (Jost 10px uppercase: filed / rewove / merged / coded / //research answered); time right-aligned (mono 9px); Bodoni 15.5px summary; mono 9.5px meta (commit hash · target page).
- Tap an entry → expands an inset panel (`oklch(0.92 0.012 85)`, 12px padding): 2–3 mono detail lines (files touched, links updated) + bordered "⤺ revert this commit" button. Reverting dims the entry to 0.4 opacity, relabels verb to "reverted", fires a toast.

### 3. Code
- Heading "The code." + "Colour is the filing system. You never choose a folder again."
- Uncoded-topic card (dashed 1px border): dashed empty 20px swatch, topic name (Bodoni 19px), note "Born of [[studio]] on Monday. The agent awaits its colour.", row of six 44×44px colour swatch buttons — picking one codes the topic and appends it to the list (and the capture wheel gains a segment; all geometry is 360°/n).
- Topic rows: 20px swatch, mono 2-letter tag, Bodoni 19px name, right-aligned mono `N pp · last`. Tap → expand: RECODE label + six 44px swatches (current at opacity 1, others 0.45) + mono note. Recolouring propagates app-wide (wheel, ledger chips, recents) — colour is derived from the single topics store, never duplicated.

### 4. Queue
- Heading "Awaiting judgement." + "Dumps the agent would not file alone. Rule on them." Empty state: italic "Nothing awaits judgement." + mono "the agent files on · confidence ≥ 0.75".
- Cards (1px border, 17px padding): confidence as "54%" (Space Mono 22px) + label "CERTAIN — FILES ALONE AT 75%"; the dump verbatim in italic Bodoni 15.5px quotes; GUESS row (chip + topic name). Actions: FILE AS GUESSED (ink, flex-1) / REDIRECT (bordered → inline chip picker "FILE INSTEAD TO") / DISCARD (underlined text). Resolved cards collapse to one line (chip + "filed to X / redirected to Y / discarded" + meta) with a persistent UNDO link. Badge count follows pending items.

### 5. Onboarding (first run only; `localStorage ceremony_onboarded_v1`)
Three full-screen steps, bone background, 3 progress squares top-right (filled ink as reached):
1. "A notebook that keeps itself." + explainer + vault row (`~/notes` / `38 pages · git`) + THIS IS MY VAULT (ink button).
2. "It listens." + mic rationale + privacy note "nothing leaves the device before you end the take" → GRANT THE MICROPHONE (violet; actually requests `getUserMedia`) / I WILL TYPE (underlined skip). After grant the note becomes "✓ granted — the pipe is open".
3. "The code." + the six-topic colour legend → BEGIN THE CEREMONY.

## Interactions & Behavior
- Capture state machine: `idle → rec → proc → routed → idle`, with `type` as a parallel entry to `proc`. Abandon (rec→idle) and background-file (proc→idle) are escape hatches. Every destructive/committing action has an undo: toast-UNDO after filing, CHANGE on the filed card, revert per ledger commit, UNDO per queue ruling.
- Live audio: on BEGIN, request mic; drive the wheel's level from an AnalyserNode RMS (eased, lerp 0.09); live transcript via SpeechRecognition (continuous, interim). If permission/API unavailable → simulated mode, clearly tagged SIMULATED.
- Feedback: two-note sine cues (begin C5→G5, end G5→C5, filed E5→B5, ~90ms apart, low gain) + `navigator.vibrate(12)` on begin/end/file/approve. User-disableable.
- Timings: tick 50ms; processing ≈1.6s (fake); segment cross-fade 0.6s; button hover inversions 0.25s; toast 3.5–4s.
- Recording continues while navigating to other tabs (nav shows dot + timer).

## State Management
- `topics` is the single source of truth for name/tag/colour/pages — every chip, wheel segment, and legend derives from it. Recolour/recode = one mutation.
- Capture: `phase, elapsed, level (eased), target, angle, active, liveText, usedLive, text, filedToId`.
- Queue: per-item `status: pending | redirecting | approved | discarded | {redirected topic}`.
- Ledger: entries keyed by commit hash; `openEntry`, `reverted[]`.
- Onboarding step + `micGranted`; persisted done-flag.
- Toast: `{msg, hasAction, secondsLeft}` + an action callback.

## Design Tokens
Colors (oklch):
- Bone (bg) `oklch(0.95 0.012 85)` · input bg `oklch(0.97 0.008 85)` · inset panel `oklch(0.92 0.012 85)`
- Ink (text/primary buttons) `oklch(0.2 0.01 70)`; secondary text `oklch(0.35–0.42 0.01 70)`; tertiary/labels `oklch(0.48–0.58 0.01 70)`
- Hairlines: ink at /0.08–/0.15; borders at /0.2–/0.3
- Topic code: work violet `oklch(0.55 0.15 300)` · studio green `oklch(0.63 0.12 150)` · ideas cyan `oklch(0.62 0.10 225)` · people orange `oklch(0.71 0.13 55)` · journal red `oklch(0.60 0.16 25)` · inbox grey `oklch(0.70 0.02 260)`
- Recording accent = violet; alert/badge = the journal red.

Typography (Google Fonts):
- **Bodoni Moda** — all content and display: headings 42/33/28px w500, topic names 23/19px, body 15–17px, italics for quotes/processing.
- **Jost** — UI labels and buttons: 9.5–12.5px, uppercase with 0.14–0.34em letter-spacing.
- **Space Mono** — technical metadata: timers 33px, confidence 22px, everything else 9–12px.

Shape: **no border radius anywhere** except perfect circles (hub button, dots). Colour chips are hard squares. Shadows only on the toast.

Spacing: screen padding 24–28px; card padding 16–18px; hairline-separated lists with 13–14px row padding; 44px minimum touch targets.

## Assets
None — no images or icon fonts. The wheel is inline SVG; all glyphs (▍ ⤺ ✓ ·) are text.

## Files
- `Ceremony v3 — App.dc.html` — the full interactive prototype (markup + logic + prop defaults).
- `support.js` — prototype runtime; needed only to open the prototype, irrelevant to the real build.
- `notebook-app-build-plan.md` — the product/agent architecture brief the design serves.

## What the real build still needs (not covered by this design)
1. **Backend + API contract.** The prototype fakes filing with a 1.6s timer. Define: `POST /dump` (audio or text) → `{commit, topic, excerpt, research[]}`; ledger = parsed `git log`; queue store; revert = `git revert`.
2. **Server-side transcription.** The prototype uses the browser SpeechRecognition API (Chrome-only, online). The plan calls for Whisper-class transcription of the uploaded audio — treat the live browser transcript as preview only.
3. **The agent itself.** Claude-loop that matches dumps against the vault, appends/reweaves/merges, computes confidence (files alone ≥ 0.75), answers `//research` — all per the build plan.
4. **PWA shell.** Manifest, icons, service worker, and an **offline capture queue** (record locally, sync when online) — capture must never fail.
5. **Vault access + auth.** Where the git repo lives (device? server? user's machine), device pairing, and sync with Obsidian.
6. **Topic/colour persistence.** The code (topic→colour map) needs a home in the vault (e.g. a `code.yml`), so Obsidian theming can share it.
7. **Real states the prototype elides:** mic-permission denied mid-take, network failure during filing, very long takes (pause? chunking?), empty vault/first-dump experience, >8 topics (wheel density), notification when a background filing lands or the agent queues something for judgement.
