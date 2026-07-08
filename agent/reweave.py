"""Phase 3/5: the nightly reweave.

Memory hardening, run while the user sleeps (and on demand via
POST /api/reweave):

- backlinks: Claude reads every topic's recent notes and proposes wikilinks;
  they land append-only in each page's ## Links (a link a human added is
  never removed).
- dedup: overlapping topics are *proposed* for consolidation in the digest —
  merging is destructive, so it stays a human decision (per the build plan:
  "destructive edits need a higher bar").
- weekly digest: once a week the agent writes what's new into digest.md.

journal is private and never rewoven. Without API credentials the semantic
parts are skipped; the digest still gets a plain mechanical summary from the
ledger so the ritual keeps its rhythm.
"""
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta
from typing import List

from pydantic import BaseModel

log = logging.getLogger("ceremony.reweave")

MODEL = os.environ.get("CEREMONY_MODEL", "claude-opus-4-8")
REWEAVE_HOUR = int(os.environ.get("CEREMONY_REWEAVE_HOUR", "3"))
NEVER_REWOVEN = {"journal"}


class TopicLinks(BaseModel):
    topic_id: str
    links: List[str]  # topic *names* this page should link to


class MergeProposal(BaseModel):
    keep: str
    fold_in: str
    why: str


class Weave(BaseModel):
    links: List[TopicLinks]
    merges: List[MergeProposal]
    digest: str  # short markdown digest of the week's thinking; "" if uneventful


SYSTEM = """You are the night hand of Ceremony, a self-organizing markdown notebook.
You are given every topic page's name, definition, and recent notes.

- links: for each topic, list the OTHER topic names its notes genuinely connect
  to. Only real conceptual links — an empty list is the common, correct answer.
- merges: topics that are duplicates of each other (e.g. "Coaching" vs "Rep
  Coaching"). Propose keep/fold_in only when clearly the same subject. Usually empty.
- digest: a short markdown paragraph (or few bullets) capturing what this
  week's notes were about — write it from the notes, never invent. If the week
  was quiet, an empty string.
"""


def _excerpt_block(vault) -> tuple[str, list]:
    import re
    topics = [t for t in vault.topics() if t["name"] not in NEVER_REWOVEN]
    lines = []
    for t in topics:
        page = vault.page_path(t)
        notes = ""
        if page.exists():
            m = re.search(r"## Notes\n(.*?)(?=\n## |\Z)", page.read_text(), re.S)
            notes = (m.group(1) if m else "").strip()[-1200:]
        lines.append(f'### id "{t["id"]}" · {t["name"]}\n{t.get("definition", "")}\n{notes}')
    return "\n\n".join(lines), topics


def _mechanical_digest(vault) -> str:
    """No-credentials fallback: count the week's ledger by topic."""
    cutoff = time.time() - 7 * 86400
    week = [e for e in vault.ledger(limit=200)
            if e["ts"] >= cutoff and e["verb"] in ("filed", "refiled") and not e.get("reverted")]
    if not week:
        return ""
    by_topic = {}
    for e in week:
        by_topic.setdefault(e["topicId"], []).append(e["summary"])
    names = {t["id"]: t["name"] for t in vault.topics()}
    lines = [f"{len(week)} notes filed this week."]
    for tid, sums in by_topic.items():
        lines.append(f"- [[{names.get(tid, tid)}]] · {len(sums)} — {sums[0][:80]}")
    return "\n".join(lines)


def run(vault, get_client) -> dict:
    """One full reweave pass. Returns a small report for the API response."""
    report = {"links": 0, "merges": 0, "digest": False, "mode": "lexical"}
    weave = None
    try:
        client = get_client()
        block, topics = _excerpt_block(vault)
        response = client.messages.parse(
            model=MODEL, max_tokens=3000, system=SYSTEM,
            messages=[{"role": "user", "content": "The vault tonight:\n\n" + block}],
            output_format=Weave,
        )
        weave = response.parsed_output
        report["mode"] = "claude"
    except Exception as e:
        log.info("reweave running lexically — %s", e)

    if weave:
        valid_names = {t["name"] for t in vault.topics() if t["name"] not in NEVER_REWOVEN}
        for tl in weave.links:
            links = [l for l in tl.links if l in valid_names]
            if links and vault.topic(tl.topic_id):
                if vault.update_links(tl.topic_id, links):
                    report["links"] += 1
        report["merges"] = len(weave.merges)

    # the weekly digest, at most once every 7 days
    last = vault.last_digest_date()
    if last is None or (date.today() - last) >= timedelta(days=7):
        body = (weave.digest.strip() if weave and weave.digest.strip()
                else _mechanical_digest(vault))
        if weave and weave.merges:
            body += "\n\n**Consolidation proposals** (merging is yours to decide):\n" + "\n".join(
                f"- fold [[{m.fold_in}]] into [[{m.keep}]] — {m.why}" for m in weave.merges)
        if body.strip():
            vault.write_digest(body)
            report["digest"] = True
    return report


def start_nightly(vault, get_client, research_worker=None):
    """Sleep till CEREMONY_REWEAVE_HOUR local, reweave, repeat. CEREMONY_REWEAVE=0 disables."""
    if os.environ.get("CEREMONY_REWEAVE", "1") == "0":
        return

    def loop():
        while True:
            now = datetime.now()
            nxt = now.replace(hour=REWEAVE_HOUR, minute=0, second=0, microsecond=0)
            if nxt <= now:
                nxt += timedelta(days=1)
            time.sleep((nxt - now).total_seconds())
            try:
                run(vault, get_client)
            except Exception as e:
                log.warning("nightly reweave failed: %s", e)
            if research_worker:
                research_worker.kick()  # sweep any research the day left behind

    threading.Thread(target=loop, daemon=True, name="reweave").start()
