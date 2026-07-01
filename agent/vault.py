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
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import yaml

VAULT_PATH = Path(os.environ.get(
    "CEREMONY_VAULT",
    Path(__file__).resolve().parent.parent / "vault",
))

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


class Vault:
    def __init__(self, path: Path = VAULT_PATH):
        self.path = Path(path)
        self._init()

    # ---------- git plumbing ----------

    def _git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-C", str(self.path), *args],
            capture_output=True, text=True, check=check,
        )

    def _commit(self, message: str) -> str:
        self._git("add", "-A")
        self._git("commit", "-m", message)
        return self._git("rev-parse", "--short", "HEAD").stdout.strip()

    def head(self) -> str:
        return self._git("rev-parse", "--short", "HEAD").stdout.strip()

    # ---------- init ----------

    def _init(self):
        if (self.path / ".git").exists():
            return
        self.path.mkdir(parents=True, exist_ok=True)
        (self.path / "inbox").mkdir(exist_ok=True)
        (self.path / "topics").mkdir(exist_ok=True)
        subprocess.run(["git", "init", "-q"], cwd=self.path, check=True)
        self._git("config", "user.name", "ceremony-agent")
        self._git("config", "user.email", "agent@ceremony.local")

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

    def recode(self, topic_id: str, color: str) -> str:
        code = self._read_code()
        topic = next(t for t in code["topics"] if t["id"] == topic_id)
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

    def file_dump(self, raw_text: str, topic: dict, cleaned: str, summary: str,
                  research: list[str], confidence: float, verb: str = "filed",
                  detail_extra: list[str] | None = None,
                  trailers_extra: list[str] | None = None) -> str:
        """Land the raw dump in /inbox and the cleaned note on the topic page. One commit."""
        now = datetime.now()
        date, hm = now.strftime("%Y-%m-%d"), now.strftime("%H:%M")
        inbox_rel = f"inbox/{now.strftime('%Y-%m-%d-%H%M%S')}-{uuid.uuid4().hex[:6]}.md"
        (self.path / "inbox").mkdir(exist_ok=True)
        (self.path / "topics").mkdir(exist_ok=True)
        (self.path / inbox_rel).write_text(
            f"---\ndate: {date} {hm}\nfiled_to: {topic['id']}\n---\n\n{raw_text}\n"
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
        detail += [f"+ //research: {q}" for q in research]
        detail += detail_extra or []
        body = "\n".join(detail)
        trailers = [f"Ceremony-Verb: {verb}", f"Ceremony-Topic: {topic['id']}",
                    f"Ceremony-Confidence: {confidence:.2f}", f"Ceremony-Inbox: {inbox_rel}"]
        trailers += trailers_extra or []
        return self._commit(f"{verb}: {summary}\n\n{body}\n\n" + "\n".join(trailers))

    def revert(self, commit: str) -> str:
        self._git("revert", "--no-commit", commit)
        return self._commit(
            f"reverted: commit {commit} undone.\n\nnothing is lost — see git history\n\n"
            f"Ceremony-Verb: reverted\nCeremony-Reverts: {commit}"
        )

    def refile(self, commit: str, new_topic_id: str) -> tuple[str, dict]:
        """Undo a filing commit and file the same dump to a different topic, in one commit."""
        body = self._git("show", "-s", "--format=%B", commit).stdout
        inbox_match = re.search(r"^Ceremony-Inbox: (.+)$", body, re.M)
        conf_match = re.search(r"^Ceremony-Confidence: (.+)$", body, re.M)
        if not inbox_match:
            raise ValueError(f"commit {commit} is not a filing commit")
        raw = (self.path / inbox_match.group(1)).read_text()
        raw_text = raw.split("---\n\n", 1)[-1].strip()
        confidence = float(conf_match.group(1)) if conf_match else 1.0

        self._git("revert", "--no-commit", commit)
        topic = self.topic(new_topic_id)
        summary = raw_text[:70].replace("\n", " ") + ("…" if len(raw_text) > 70 else "")
        new_commit = self.file_dump(
            raw_text, topic, raw_text, summary, [], confidence,
            verb="refiled", detail_extra=[f"moved by hand · was {commit}"],
        )
        return new_commit, topic

    # ---------- the queue ----------

    def _read_queue(self) -> list[dict]:
        return json.loads((self.path / "_queue.json").read_text())

    def _write_queue(self, queue: list[dict]):
        (self.path / "_queue.json").write_text(json.dumps(queue, indent=2, ensure_ascii=False))

    def queue(self) -> list[dict]:
        return self._read_queue()

    def queue_add(self, text: str, cleaned: str, summary: str, guess_id: str,
                  confidence: float, research: list[str]) -> tuple[str, dict]:
        entry = {
            "id": uuid.uuid4().hex[:8], "ts": time.time(),
            "text": text, "cleaned": cleaned, "summary": summary,
            "guess": guess_id, "confidence": round(confidence, 2),
            "research": research, "status": "pending", "commit": None,
        }
        q = self._read_queue()
        q.append(entry)
        self._write_queue(q)
        commit = self._commit(
            f"queued: {summary}\n\nconfidence {confidence:.2f} — below the bar, awaiting judgement\n\n"
            f"Ceremony-Verb: queued\nCeremony-Topic: {guess_id}"
        )
        return commit, entry

    def queue_rule(self, entry_id: str, action: str, topic_id: str | None = None) -> dict:
        """Rule on a held dump. Every ruling is one commit tagged Ceremony-Queue,
        so undo is `git revert` of that commit (which also restores the queue file)."""
        q = self._read_queue()
        entry = next(e for e in q if e["id"] == entry_id)
        if action in ("approve", "redirect"):
            target = self.topic(topic_id or entry["guess"])
            entry.update(status="approved" if action == "approve" else "redirected",
                         ruled_to=target["id"])
            self._write_queue(q)
            self.file_dump(
                entry["text"], target, entry.get("cleaned") or entry["text"],
                entry["summary"], entry.get("research", []), entry["confidence"],
                detail_extra=["ruled by hand · from the queue"],
                trailers_extra=[f"Ceremony-Queue: {entry_id}"],
            )
        elif action == "discard":
            entry["status"] = "discarded"
            self._write_queue(q)
            self._commit(
                f"discarded: {entry['summary']}\n\nkept in git history — nothing is lost\n\n"
                f"Ceremony-Verb: discarded\nCeremony-Topic: {entry['guess']}\n"
                f"Ceremony-Queue: {entry_id}"
            )
        elif action == "undo":
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
        return entry

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
        }
