# Build Plan: A Self-Organizing Markdown Notebook

**One sentence:** A capture pipe and an autonomous agent that turn voice and text brain-dumps from any device into a self-organizing wiki of plain markdown files you own, with cited research filled in automatically.

## The move that makes this small

You picked plain markdown, sync on both devices, and full autonomy. Those three answers point at one architecture, and it's leaner than it sounds.

**Don't build a note-taking app. Build two things and compose the rest.**

- What you build: a **capture client** (voice and text, phone and laptop) and an **agent** (organizes, researches, writes files).
- What you don't build: the reading and editing UI. Because the vault is plain markdown, **Obsidian is your reader** on desktop and phone. VS Code, Typora, anything works too. You get a polished wiki interface for free and never maintain it.

That one decision cuts the project roughly in half.

## Reconciling your two answers

You said "folder I own," not "git repo." Those don't conflict. Git is just the mechanism that delivers what you actually asked for.

- **Ownership** stays total. Your files, your folder, your GitHub.
- **Sync across phone and laptop** happens through the repo.
- **Version history** becomes your undo button when the agent does something dumb.

So the vault is a private git repo. It's still a plain folder you own. Git is plumbing, not lock-in.

## The three pieces

```
   PHONE PWA ─┐
              ├──►  AGENT (Python)  ──►  VAULT (git repo of .md)
   LAPTOP PWA ┘         │                      ▲
                        │                      │
                   web research         Obsidian reads/edits
                   embeddings index     (desktop + mobile)
```

1. **Vault.** Private git repo. Plain markdown. The single source of truth.
2. **Agent.** Python service. The only thing that writes to the vault. Transcribes, organizes, researches, commits.
3. **Clients.** A React PWA for capture on phone and laptop. Reading happens in Obsidian.

## Life of a brain-dump

1. You talk into the phone for two minutes. The PWA records, transcribes, and sends the raw text to the agent. Typed dumps skip transcription.
2. The agent pulls the latest vault and drops the raw dump in `/inbox` first. Nothing is ever lost.
3. The agent runs a **semantic search** over the existing vault to answer one question: have I talked about this before?
4. It decides: new page, append to an existing page, or split into several. It writes markdown with wikilinks and updates the map of content.
5. If anything is research-worthy, it does web research and writes a **cited** findings section.
6. It commits. Every action is one commit you can read and revert.

## Vault structure (the Wikipedia feel)

```
/vault
  /inbox            raw dumps land here first, untouched
  /topics           the wiki: one file per concept
    sales-coaching.md
    the-translator.md
  /journal          dated entries, your diary spine
    2026-07-01.md
  _moc.md           map of content, agent-maintained
  /_index           embeddings + metadata, rebuildable, disposable
```

Every topic page uses the same anatomy so your thinking and the AI's additions never blur.

```markdown
# Topic Name
> one-line definition the agent keeps current

## Notes
your captured thinking, lightly cleaned, never invented

## Links
[[related-page]] [[another-page]]

## Research
agent-added. every claim carries a source link.

## Log
2026-07-01  what changed, appended
```

The hard line: **Notes are yours. Research is the agent's, and it's always cited.** Your own thinking never gets contaminated with unverified AI text.

## Making full autonomy safe

Autonomous organize-and-research fails in predictable ways. Design against each one up front.

- **Duplication.** It creates "Coaching" and "Rep Coaching" as two pages. Guard: semantic dedup check before any new page, plus a weekly consolidation pass.
- **Silent bad edits.** It rewrites a page and loses content. Guard: git. One commit per action, append-first bias, destructive edits need a higher bar. You diff and revert like code.
- **Research hallucination.** It writes "facts" with no source. Guard: research findings must carry links, live in their own section, and be marked as external.
- **Runaway cost.** It researches everything and burns tokens. Guard: research is triggered, not automatic on every dump. Flag it inline with `//research`, or let the agent batch proposals for you.
- **Sync conflicts.** You edit in Obsidian while the agent commits. Guard: the agent pulls before writing and makes small atomic commits. Rare if it appends and you edit elsewhere.

Your autonomy stays full. Git is what makes full autonomy survivable.

## Build phases

Thin end-to-end slice first, then thicken.

**Phase 0: The spine.** Git vault plus one endpoint that takes text, appends a dated file to `/inbox`, and commits. No AI. Proves the pipe: dump in, file appears, syncs, shows up in Obsidian.

**Phase 1: Capture from both devices.** React PWA with a text box, voice record, and transcription that POSTs to the endpoint. Now you brain-dump from anywhere and it lands.

**Phase 2: The organizer.** The agent processes `/inbox`: semantic search, decide file/append/split, write with wikilinks, update `_moc.md`, commit. This is the magic. The embeddings index goes live here.

**Phase 3: Memory hardening.** Dedup, backlinks, consolidation pass, and a weekly digest of what's new. "Remembers what I've talked about" gets real here.

**Phase 4: Research.** The agent detects or takes flagged research targets, does web research, writes cited findings, commits.

**Phase 5: Autonomy tuning.** Nightly scheduled organize pass, notifications, and a custom reading surface only if Obsidian isn't enough.

Ship Phase 0 and 1 in a weekend. That alone is a working voice-to-markdown brain-dump you own.

## Stack (mapped to what you already ship)

- **Capture client:** React PWA. Your wheelhouse. Deploy on Netlify.
- **Voice:** two options, see the calls below.
- **Agent:** Python and FastAPI. Your wheelhouse. Needs a real host, not Netlify functions, because it holds a git repo and runs long jobs. Fly.io or Railway, or run it as a laptop daemon for Phases 0 to 2.
- **Vault:** private GitHub repo.
- **Index:** sqlite plus embeddings, or LanceDB. Rebuildable from the vault, so it's disposable.
- **Brain:** Claude for the agent reasoning and research. Slots into the model benchmarking you're already doing.
- **Reading:** Obsidian, desktop and mobile.

## Two calls to make

1. **Voice quality vs. cost.** The Web Speech API is free and live but rougher. Recording audio and running server-side Whisper is cleaner for rambly two-minute dumps. Start with Web Speech in Phase 1, add Whisper if the transcripts annoy you.
2. **Where the agent lives.** A laptop daemon is free and fine while it's just you at your desk. A $5 Fly or Railway box makes it always-on, so phone dumps get processed even when your laptop is closed. Start local, move to a box once Phase 2 works.

Reading on phone is Obsidian mobile. Smooth sync there is either Obsidian Sync (paid, painless) or a git-sync setup (free, fiddlier). Worth knowing before you count on it.
