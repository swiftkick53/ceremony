"""The vault: a private git repo of plain markdown that the agent owns.

Layout (see notebook-app-build-plan.md):
  /inbox      raw dumps land here first, untouched — nothing is ever lost
  /topics     the wiki: one file per topic
  _moc.md     map of content, agent-maintained
  code.yml    the code: topic -> colour map, shared with Obsidian theming
  _queue.json dumps the agent would not file alone (confidence < threshold)

Every action is one git commit carrying Ceremony-* trailers so the ledger
is just parsed `git log`, and revert is `git revert`.
"""
import json
import os
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import yaml

VAULT_PATH = Path(os.environ.get(
    "CEREMONY_VAULT",
    Path(__file__).resolve().parent.parent / "vault",
))

# Optional remote for the vault repo (hosted deployments). When set, a fresh
# agent clones the vault from here instead of seeding an empty one, and every
# commit is pushed back — the private remote is the vault's real home.
VAULT_REMOTE = os.environ.get("CEREMONY_VAULT_REMOTE", "")

class VaultError(Exception):
    """A vault operation that could not be applied cleanly (e.g. a revert that
    conflicts). The vault has been restored to its last committed state."""


DEFAULT_TOPICS = [
    {"id": "wk", "tag": "WK", "name": "work",    "color": "oklch(0.55 0.15 300)", "definition": "projects, deadlines, the professional thread"},
    {"id": "st", "tag": "ST", "name": "studio",  "color": "oklch(0.63 0.12 150)", "definition": "essays, drafts, fragments — things being made"},
    {"id": "id", "tag": "ID", "name": "ideas",   "color": "oklch(0.62 0.10 225)", "definition": "unclaimed sparks not yet attached to a project"},
    {"id": "pe", "tag": "PE", "name": "people",  "color": "oklch(0.71 0.13 55)",  "definition": "one page per person who matters"},
    {"id": "jn", "tag": "JN", "name": "journal", "color": "oklch(0.60 0.16 25)",  "definition": "dated diary entries, private, never rewoven"},
    {"id": "in", "tag": "IN", "name": "inbox",   "color": "oklch(0.70 0.02 260)", "definition": "the waiting room for what fits nowhere yet"},
]

PAGE_TEMPLATE = """# {name}

> {definition}

## Notes

## Links

## Research

## Log
"""


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "untitled"


def _append_section(content: str, header: str, text: str) -> str:
    """Append text at the end of a `## header` section, keeping other sections intact."""
    lines = content.splitlines()
    marker = f"## {header}"
    if marker not in lines:
        return content.rstrip("\n") + f"\n\n{marker}\n\n{text}\n"
    i = lines.index(marker)
    j = i + 1
    while j < len(lines) and not lines[j].startswith("## "):
        j += 1
    while j > i + 1 and lines[j - 1].strip() == "":
        j -= 1
    new_lines = lines[:j] + ["", *text.splitlines()] + lines[j:]
    return "\n".join(new_lines).rstrip("\n") + "\n"


def _mutating(fn):
    """Serialize vault mutations and make them atomic: concurrent requests
    (FastAPI runs sync endpoints on a threadpool) must not interleave their
    `git add -A` / commit, and a half-applied operation must never leak into
    the next commit. On any failure the working tree is restored to HEAD."""
    @wraps(fn)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            try:
                return fn(self, *args, **kwargs)
            except Exception:
                self._restore_clean()
                raise
    return wrapper


class Vault:
    def __init__(self, path: Path = VAULT_PATH):
        self.path = Path(path)
        self._has_remote = False
        self._lock = threading.RLock()
        self.sync_error: str | None = None
        self._init()

    def _restore_clean(self):
        """Drop any uncommitted state a failed operation left behind."""
        for args in (("revert", "--abort"), ("rebase", "--abort"),
                     ("reset", "--hard", "HEAD"), ("clean", "-fdq")):
            self._git(*args, check=False)

    def _ensure_remote(self):
        """Adopt CEREMONY_VAULT_REMOTE as origin (or notice an existing origin)."""
        has_origin = self._git("remote", "get-url", "origin", check=False).returncode == 0
        if VAULT_REMOTE and not has_origin:
            self._git("remote", "add", "origin", VAULT_REMOTE)
            has_origin = True
        self._has_remote = has_origin

    # ---------- git plumbing ----------

    def _git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-C", str(self.path), *args],
            capture_output=True, text=True, check=check,
        )

    def _commit(self, message: str) -> str:
        self._git("add", "-A")
        if self._git("diff", "--cached", "--quiet", check=False).returncode == 0:
            # e.g. reverting a commit whose changes are already undone
            raise VaultError("nothing changed — that action was already applied")
        self._git("commit", "-m", message)
        head = self._git("rev-parse", "--short", "HEAD").stdout.strip()
        self._push_async()
        return head

    _push_lock = threading.Lock()

    def _push_async(self):
        """Fire-and-forget push to origin, if the vault has one. Never blocks
        or fails a request — the remote is a mirror, git history is the truth.
        A rejected push (e.g. the vault was edited from another machine) is
        retried once after `pull --rebase`; persistent failure is surfaced
        via sync_error so the client can show it instead of silently drifting."""
        if not self._has_remote:
            return

        def push():
            with self._push_lock:
                res = self._git("push", "-q", "origin", "HEAD", check=False)
                if res.returncode != 0:
                    with self._lock:
                        pull = self._git("pull", "--rebase", "-q", "origin", "HEAD", check=False)
                        if pull.returncode != 0:
                            self._git("rebase", "--abort", check=False)
                    res = self._git("push", "-q", "origin", "HEAD", check=False)
                self.sync_error = None if res.returncode == 0 else (
                    (res.stderr or "push failed").strip().splitlines()[-1][:200])

        threading.Thread(target=push, daemon=True).start()

    def head(self) -> str:
        return self._git("rev-parse", "--short", "HEAD").stdout.strip()

    # ---------- init ----------

    def _init(self):
        if (self.path / ".git").exists():
            self._ensure_remote()
            return
        if VAULT_REMOTE:
            res = subprocess.run(
                ["git", "clone", "-q", VAULT_REMOTE, str(self.path)],
                capture_output=True, text=True,
            )
            if res.returncode == 0:
                self._git("config", "user.name", "ceremony-agent")
                self._git("config", "user.email", "agent@ceremony.local")
                if self._git("rev-parse", "HEAD", check=False).returncode == 0:
                    (self.path / "inbox").mkdir(exist_ok=True)
                    (self.path / "topics").mkdir(exist_ok=True)
                    self._has_remote = True
                    return
                # cloned an empty repo — fall through and seed into it
        self.path.mkdir(parents=True, exist_ok=True)
        (self.path / "inbox").mkdir(exist_ok=True)
        (self.path / "topics").mkdir(exist_ok=True)
        # -b main so pushes land on the branch GitHub expects; older git falls back
        if subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.path).returncode != 0:
            subprocess.run(["git", "init", "-q"], cwd=self.path, check=True)
        self._git("config", "user.name", "ceremony-agent")
        self._git("config", "user.email", "agent@ceremony.local")
        self._ensure_remote()

        self._write_code({"topics": DEFAULT_TOPICS})
        for t in DEFAULT_TOPICS:
            page = self.path / "topics" / f"{_slug(t['name'])}.md"
            page.write_text(PAGE_TEMPLATE.format(name=t["name"], definition=t["definition"]))
        self._write_queue([])
        self._write_moc()
        self._commit("init: the vault is open\n\nCeremony-Verb: init")

    # ---------- the code (topics) ----------

    def _read_code(self) -> dict:
        return yaml.safe_load((self.path / "code.yml").read_text())

    def _write_code(self, code: dict):
        (self.path / "code.yml").write_text(
            yaml.safe_dump(code, sort_keys=False, allow_unicode=True)
        )

    def topics(self) -> list[dict]:
        return self._read_code()["topics"]

    def topic(self, topic_id: str) -> dict | None:
        return next((t for t in self.topics() if t["id"] == topic_id), None)

    def page_path(self, topic: dict) -> Path:
        return self.path / "topics" / f"{_slug(topic['name'])}.md"

    @_mutating
    def create_topic(self, name: str, definition: str = "") -> dict:
        """New topic born of the agent — uncoded (no colour) until the user codes it."""
        code = self._read_code()
        slug = _slug(name)
        existing = next((t for t in code["topics"] if _slug(t["name"]) == slug), None)
        if existing:
            return existing
        tag = "".join(w[0] for w in name.split()[:2]).upper()[:2] or slug[:2].upper()
        topic = {"id": slug, "tag": tag, "name": name, "color": None,
                 "definition": definition or "a new page, definition pending"}
        code["topics"].append(topic)
        self._write_code(code)
        page = self.page_path(topic)
        if not page.exists():
            page.write_text(PAGE_TEMPLATE.format(name=name, definition=topic["definition"]))
        self._write_moc()
        return topic

    @_mutating
    def recode(self, topic_id: str, color: str) -> str:
        code = self._read_code()
        topic = next((t for t in code["topics"] if t["id"] == topic_id), None)
        if topic is None:
            raise KeyError(f"no such topic: {topic_id}")
        was_uncoded = topic["color"] is None
        topic["color"] = color
        self._write_code(code)
        verb = "coded" if was_uncoded else "recoded"
        summary = (f"New topic [[{topic['name']}]] entered the code — colour assigned."
                   if was_uncoded else f"[[{topic['name']}]] recoded.")
        return self._commit(
            f"{verb}: {summary}\n\ncolour → {color}\n\n"
            f"Ceremony-Verb: {verb}\nCeremony-Topic: {topic_id}"
        )

    def _write_moc(self):
        code = self._read_code() if (self.path / "code.yml").exists() else {"topics": DEFAULT_TOPICS}
        lines = ["# Map of content", "", "agent-maintained. one line per topic.", ""]
        for t in code["topics"]:
            lines.append(f"- [[{_slug(t['name'])}]] — {t.get('definition', '')}")
        (self.path / "_moc.md").write_text("\n".join(lines) + "\n")

    # ---------- filing ----------

    def _write_audio(self, audio: bytes, audio_ext: str, stem: str) -> str:
        """Keep the raw audio next to the raw dump in /inbox. Returns the rel path."""
        rel = f"inbox/{stem}.{audio_ext}"
        (self.path / "inbox").mkdir(exist_ok=True)
        (self.path / rel).write_bytes(audio)
        return rel

    @_mutating
    def file_dump(self, raw_text: str, topic: dict, cleaned: str, summary: str,
                  research: list[str], confidence: float, verb: str = "filed",
                  detail_extra: list[str] | None = None,
                  trailers_extra: list[str] | None = None,
                  audio: bytes | None = None, audio_ext: str = "webm") -> str:
        """Land the raw dump in /inbox and the cleaned note on the topic page. One commit."""
        now = datetime.now()
        date, hm = now.strftime("%Y-%m-%d"), now.strftime("%H:%M")
        stem = f"{now.strftime('%Y-%m-%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        inbox_rel = f"inbox/{stem}.md"
        (self.path / "inbox").mkdir(exist_ok=True)
        (self.path / "topics").mkdir(exist_ok=True)
        audio_rel = self._write_audio(audio, audio_ext, stem) if audio else None
        audio_fm = f"audio: {audio_rel}\n" if audio_rel else ""
        (self.path / inbox_rel).write_text(
            f"---\ndate: {date} {hm}\nfiled_to: {topic['id']}\n{audio_fm}---\n\n{raw_text}\n"
        )

        page = self.page_path(topic)
        if not page.exists():
            page.write_text(PAGE_TEMPLATE.format(name=topic["name"], definition=topic.get("definition", "")))
        content = page.read_text()
        content = _append_section(content, "Notes", f"**{date} {hm}** — {cleaned}")
        for q in research:
            content = _append_section(content, "Research", f"- [ ] {q} — queued {date}")
        content = _append_section(content, "Log", f"{date} {hm}  {verb} · {summary}")
        page.write_text(content)
        self._write_moc()

        note_lines = 1 + len(cleaned.splitlines())
        detail = [f"+ {note_lines} lines → topics/{_slug(topic['name'])}.md",
                  f"raw dump kept → {inbox_rel}"]
        if audio_rel:
            detail.append(f"raw audio kept → {audio_rel}")
        detail += [f"+ //research: {q}" for q in research]
        detail += detail_extra or []
        body = "\n".join(detail)
        trailers = [f"Ceremony-Verb: {verb}", f"Ceremony-Topic: {topic['id']}",
                    f"Ceremony-Confidence: {confidence:.2f}", f"Ceremony-Inbox: {inbox_rel}"]
        if audio_rel:
            trailers.append(f"Ceremony-Audio: {audio_rel}")
        trailers += trailers_extra or []
        return self._commit(f"{verb}: {summary}\n\n{body}\n\n" + "\n".join(trailers))

    @_mutating
    def revert(self, commit: str) -> str:
        res = self._git("revert", "--no-commit", commit, check=False)
        if res.returncode != 0:
            raise VaultError(
                f"commit {commit} cannot be reverted cleanly — "
                "it may already be undone, or later commits touch the same lines"
            )
        return self._commit(
            f"reverted: commit {commit} undone.\n\nnothing is lost — see git history\n\n"
            f"Ceremony-Verb: reverted\nCeremony-Reverts: {commit}"
        )

    @_mutating
    def refile(self, commit: str, new_topic_id: str) -> tuple[str, dict]:
        """Undo a filing commit and file the same dump to a different topic, in one commit."""
        topic = self.topic(new_topic_id)
        if topic is None:
            raise KeyError(f"no such topic: {new_topic_id}")
        show = self._git("show", "-s", "--format=%B", commit, check=False)
        if show.returncode != 0:
            raise KeyError(f"no such commit: {commit}")
        body = show.stdout
        inbox_match = re.search(r"^Ceremony-Inbox: (.+)$", body, re.M)
        conf_match = re.search(r"^Ceremony-Confidence: (.+)$", body, re.M)
        audio_match = re.search(r"^Ceremony-Audio: (.+)$", body, re.M)
        if not inbox_match:
            raise ValueError(f"commit {commit} is not a filing commit")
        inbox_path = self.path / inbox_match.group(1)
        if not inbox_path.exists():
            raise VaultError(
                f"the raw dump of {commit} is gone from the inbox — "
                "was that filing already reverted?"
            )
        raw = inbox_path.read_text()
        raw_text = raw.split("---\n\n", 1)[-1].strip()
        confidence = float(conf_match.group(1)) if conf_match else 1.0
        # read the audio before the revert removes it, so it survives the refile
        audio, audio_ext = None, "webm"
        if audio_match:
            audio_path = self.path / audio_match.group(1)
            if audio_path.exists():
                audio = audio_path.read_bytes()
                audio_ext = audio_path.suffix.lstrip(".") or "webm"

        res = self._git("revert", "--no-commit", commit, check=False)
        if res.returncode != 0:
            raise VaultError(f"commit {commit} cannot be refiled — the revert does not apply cleanly")
        summary = raw_text[:70].replace("\n", " ") + ("…" if len(raw_text) > 70 else "")
        new_commit = self.file_dump(
            raw_text, topic, raw_text, summary, [], confidence,
            verb="refiled", detail_extra=[f"moved by hand · was {commit}"],
            audio=audio, audio_ext=audio_ext,
        )
        return new_commit, topic

    # ---------- the queue ----------

    def _read_queue(self) -> list[dict]:
        return json.loads((self.path / "_queue.json").read_text())

    def _write_queue(self, queue: list[dict]):
        (self.path / "_queue.json").write_text(json.dumps(queue, indent=2, ensure_ascii=False))

    def queue(self) -> list[dict]:
        return self._read_queue()

    @_mutating
    def queue_add(self, text: str, cleaned: str, summary: str, guess_id: str,
                  confidence: float, research: list[str],
                  audio: bytes | None = None, audio_ext: str = "webm") -> tuple[str, dict]:
        entry = {
            "id": uuid.uuid4().hex[:8], "ts": time.time(),
            "text": text, "cleaned": cleaned, "summary": summary,
            "guess": guess_id, "confidence": round(confidence, 2),
            "research": research, "status": "pending", "commit": None,
        }
        if audio:
            # the audio lands in the vault the moment it's queued — nothing is lost
            stem = f"{datetime.now().strftime('%Y-%m-%d-%H%M%S')}-{entry['id']}"
            entry["audio"] = self._write_audio(audio, audio_ext, stem)
        q = self._read_queue()
        q.append(entry)
        self._write_queue(q)
        audio_trailer = f"\nCeremony-Audio: {entry['audio']}" if audio else ""
        commit = self._commit(
            f"queued: {summary}\n\nconfidence {confidence:.2f} — below the bar, awaiting judgement\n\n"
            f"Ceremony-Verb: queued\nCeremony-Topic: {guess_id}{audio_trailer}"
        )
        return commit, entry

    @_mutating
    def queue_rule(self, entry_id: str, action: str, topic_id: str | None = None) -> dict:
        """Rule on a held dump. Every ruling is one commit tagged Ceremony-Queue,
        so undo is `git revert` of that commit (which also restores the queue file)."""
        q = self._read_queue()
        entry = next((e for e in q if e["id"] == entry_id), None)
        if entry is None:
            raise KeyError(f"no such queue entry: {entry_id}")
        if action in ("approve", "redirect"):
            if entry["status"] != "pending":
                raise ValueError(f"entry {entry_id} was already ruled on")
            target = self.topic(topic_id or entry["guess"])
            if target is None:
                raise KeyError(f"no such topic: {topic_id or entry['guess']}")
            entry.update(status="approved" if action == "approve" else "redirected",
                         ruled_to=target["id"])
            self._write_queue(q)
            trailers = [f"Ceremony-Queue: {entry_id}"]
            detail = ["ruled by hand · from the queue"]
            if entry.get("audio"):
                # audio already lives in /inbox from queue_add — just reference it
                trailers.append(f"Ceremony-Audio: {entry['audio']}")
                detail.append(f"raw audio kept → {entry['audio']}")
            self.file_dump(
                entry["text"], target, entry.get("cleaned") or entry["text"],
                entry["summary"], entry.get("research", []), entry["confidence"],
                detail_extra=detail,
                trailers_extra=trailers,
            )
        elif action == "discard":
            if entry["status"] != "pending":
                raise ValueError(f"entry {entry_id} was already ruled on")
            entry["status"] = "discarded"
            self._write_queue(q)
            self._commit(
                f"discarded: {entry['summary']}\n\nkept in git history — nothing is lost\n\n"
                f"Ceremony-Verb: discarded\nCeremony-Topic: {entry['guess']}\n"
                f"Ceremony-Queue: {entry_id}"
            )
        elif action == "undo":
            if entry["status"] == "pending":
                return entry  # nothing to undo — a double-tap must not revert twice
            res = self._git("log", "--format=%h", f"--grep=Ceremony-Queue: {entry_id}",
                            "-1", check=False)
            ruling_commit = res.stdout.strip().splitlines()[0] if res.stdout.strip() else None
            if ruling_commit:
                self.revert(ruling_commit)
            else:
                entry["status"] = "pending"
                self._write_queue(q)
                self._commit(f"queued: ruling on {entry_id} undone\n\nCeremony-Verb: queued")
            q = self._read_queue()
            entry = next(e for e in q if e["id"] == entry_id)
        else:
            raise ValueError(f"unknown action: {action}")
        return entry

    # ---------- research ----------

    RESEARCH_ITEM = re.compile(r"^- \[ \] (.+?) — queued (\d{4}-\d{2}-\d{2})$", re.M)

    def pending_research(self) -> list[dict]:
        """Unanswered `- [ ]` items from every topic's ## Research section."""
        out = []
        for t in self.topics():
            page = self.page_path(t)
            if not page.exists():
                continue
            m = re.search(r"## Research\n(.*?)(?=\n## |\Z)", page.read_text(), re.S)
            if not m:
                continue
            for item in self.RESEARCH_ITEM.finditer(m.group(1)):
                out.append({"topic_id": t["id"], "topic_name": t["name"],
                            "question": item.group(1), "queued": item.group(2)})
        return out

    @_mutating
    def write_research_answer(self, topic_id: str, question: str, findings_md: str) -> str:
        """Check the item off and append the cited findings beneath it. One commit."""
        topic = self.topic(topic_id)
        if topic is None:
            raise KeyError(f"no such topic: {topic_id}")
        page = self.page_path(topic)
        content = page.read_text()
        date = datetime.now().strftime("%Y-%m-%d")
        needle = f"- [ ] {question} — queued "
        idx = content.find(needle)
        if idx == -1:
            raise ValueError(f"research item not found on [[{topic['name']}]]: {question}")
        line_end = content.index("\n", idx) if "\n" in content[idx:] else len(content)
        block = (f"- [x] {question} — answered {date}\n"
                 + "\n".join("  " + ln if ln.strip() else "" for ln in findings_md.strip().splitlines()))
        content = content[:idx] + block + content[line_end:]
        content = _append_section(content, "Log", f"{date}  researched · {question[:60]}")
        page.write_text(content)
        short_q = question[:70] + ("…" if len(question) > 70 else "")
        return self._commit(
            f"researched: {short_q}\n\n+ cited findings → topics/{_slug(topic['name'])}.md\n\n"
            f"Ceremony-Verb: researched\nCeremony-Topic: {topic_id}"
        )

    # ---------- reweave ----------

    @_mutating
    def update_links(self, topic_id: str, links: list[str]) -> str | None:
        """Union new wikilinks into a topic page's ## Links section. Append-only —
        reweave never removes a link a human may have placed. None if no change."""
        topic = self.topic(topic_id)
        if topic is None:
            raise KeyError(f"no such topic: {topic_id}")
        page = self.page_path(topic)
        content = page.read_text()
        m = re.search(r"## Links\n(.*?)(?=\n## |\Z)", content, re.S)
        existing = set(re.findall(r"\[\[([^\]]+)\]\]", m.group(1))) if m else set()
        fresh = [l for l in links if l not in existing and _slug(l) != _slug(topic["name"])]
        if not fresh:
            return None
        line = " ".join(f"[[{l}]]" for l in fresh)
        content = _append_section(content, "Links", line)
        date = datetime.now().strftime("%Y-%m-%d")
        content = _append_section(content, "Log", f"{date}  rewove · linked {', '.join(fresh)}")
        page.write_text(content)
        return self._commit(
            f"rewove: [[{topic['name']}]] linked to {', '.join(fresh)}\n\n"
            f"Ceremony-Verb: rewove\nCeremony-Topic: {topic_id}"
        )

    @_mutating
    def write_digest(self, body_md: str) -> str:
        """Prepend this week's digest to digest.md. One commit."""
        date = datetime.now().strftime("%Y-%m-%d")
        path = self.path / "digest.md"
        old = path.read_text() if path.exists() else "# Digest\n\nagent-written, weekly. newest first.\n"
        head, _, rest = old.partition("\n## ")
        section = f"\n## week of {date}\n\n{body_md.strip()}\n"
        path.write_text(head.rstrip("\n") + "\n" + section + (("\n## " + rest) if rest else ""))
        return self._commit(
            f"digest: the week of {date}, rewoven\n\nCeremony-Verb: digest"
        )

    def last_digest_date(self):
        path = self.path / "digest.md"
        if not path.exists():
            return None
        m = re.search(r"^## week of (\d{4}-\d{2}-\d{2})$", path.read_text(), re.M)
        return datetime.strptime(m.group(1), "%Y-%m-%d").date() if m else None

    # ---------- the ledger ----------

    def ledger(self, limit: int = 60) -> list[dict]:
        out = self._git("log", f"-{limit}", "--format=%h%x01%ct%x01%s%x01%b%x02").stdout
        entries = []
        for chunk in out.split("\x02"):
            chunk = chunk.strip("\n")
            if not chunk:
                continue
            h, ct, subject, body = (chunk.split("\x01") + ["", "", ""])[:4]
            trailers = dict(re.findall(r"^Ceremony-([A-Za-z]+): (.+)$", body, re.M))
            verb = trailers.get("Verb", "commit")
            if verb in ("queue-note",):
                continue
            detail = [ln for ln in body.splitlines()
                      if ln.strip() and not ln.startswith("Ceremony-")]
            summary = subject.split(": ", 1)[-1]
            entries.append({
                "commit": h, "ts": int(ct), "verb": verb,
                "topicId": trailers.get("Topic"), "summary": summary,
                "detail": detail, "reverts": trailers.get("Reverts"),
            })
        return entries

    # ---------- state ----------

    def state(self) -> dict:
        topics = self.topics()
        ledger = self.ledger()
        reverted = {e["reverts"] for e in ledger if e.get("reverts")}
        for e in ledger:
            e["reverted"] = e["commit"] in reverted
        stats = {t["id"]: {"pages": 1, "last": None} for t in topics}
        for e in ledger:
            tid = e["topicId"]
            if tid in stats and e["verb"] in ("filed", "refiled") and not e["reverted"]:
                stats[tid]["pages"] += 1
                if stats[tid]["last"] is None:
                    stats[tid]["last"] = e["ts"]

        def fmt_last(ts):
            if ts is None:
                return "—"
            d = datetime.fromtimestamp(ts)
            now = datetime.now()
            if d.date() == now.date():
                return d.strftime("%H:%M")
            if now.date() - d.date() < timedelta(days=7):
                return d.strftime("%a")
            return d.strftime("%m-%d")

        enriched = [{
            **t,
            "pages": stats[t["id"]]["pages"],
            "last": fmt_last(stats[t["id"]]["last"]),
            "note": f"{stats[t['id']]['pages']} pp · {t.get('definition', '')}",
        } for t in topics]

        return {
            "vault": {"path": str(self.path), "pages": sum(s["pages"] for s in stats.values())},
            "topics": enriched,
            "ledger": ledger,
            "queue": self._read_queue(),
            "sync": ({"remote": True, "error": self.sync_error}
                     if self._has_remote else {"remote": False, "error": None}),
        }
