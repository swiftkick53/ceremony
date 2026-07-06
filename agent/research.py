"""Phase 4: the research worker.

Filing extracts `//research` flags into each topic page's ## Research section
as unchecked items. This worker answers them: Claude with web search writes a
short, cited findings block, the vault checks the item off, one commit per
answer. Research is the agent's and always cited — it never touches ## Notes.

Runs in a single background thread; kicked after any filing that queued a
flag, by POST /api/research/run, and by the nightly reweave. Without API
credentials the items simply wait — the checkbox is the queue.
"""
import logging
import os
import threading

log = logging.getLogger("ceremony.research")

MODEL = os.environ.get("CEREMONY_MODEL", "claude-opus-4-8")
MAX_CONTINUATIONS = 5

SYSTEM = """You are the research hand of Ceremony, a personal markdown notebook.
Answer the user's flagged research question using web search.

- Be brief: a few sentences to a short paragraph, plus a source list.
- EVERY claim must be backed by a search result. If the search comes up dry,
  say so plainly — never fill the gap from memory.
- Output plain markdown (no headings). End with a `Sources:` list of the
  URLs you actually relied on, one `- title — url` per line.
"""


def _answer(client, question: str, topic_name: str) -> str | None:
    """One research question -> cited markdown findings, or None on failure."""
    messages = [{
        "role": "user",
        "content": (f"Research question (from the notebook page [[{topic_name}]]):\n"
                    f"{question}"),
    }]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}]
    response = None
    for _ in range(MAX_CONTINUATIONS):
        response = client.messages.create(
            model=MODEL, max_tokens=2000, system=SYSTEM,
            messages=messages, tools=tools,
        )
        if response.stop_reason != "pause_turn":
            break
        messages = [messages[0], {"role": "assistant", "content": response.content}]
    if response is None:
        return None

    text = "\n".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        return None
    # collect any cited URLs the text blocks carry, in case the model's own
    # Sources list missed them
    cited = []
    for b in response.content:
        for c in (getattr(b, "citations", None) or []):
            url = getattr(c, "url", None)
            title = getattr(c, "title", None) or url
            if url and url not in [u for _, u in cited]:
                cited.append((title, url))
    if cited and "Sources:" not in text:
        text += "\n\nSources:\n" + "\n".join(f"- {t} — {u}" for t, u in cited)
    return text


class ResearchWorker:
    def __init__(self, vault, get_client):
        self.vault = vault
        self.get_client = get_client  # lazy — shares the brain's client/credentials
        self._wake = threading.Event()
        self._running = threading.Lock()
        self.enabled = os.environ.get("CEREMONY_RESEARCH", "1") != "0"
        if self.enabled:
            threading.Thread(target=self._loop, daemon=True, name="research").start()

    def kick(self):
        """Schedule a pass over everything pending. Cheap; safe to over-call."""
        if self.enabled:
            self._wake.set()

    def _loop(self):
        while True:
            self._wake.wait()
            self._wake.clear()
            with self._running:
                self._pass()

    def _pass(self):
        pending = self.vault.pending_research()
        if not pending:
            return
        try:
            client = self.get_client()
        except Exception as e:
            log.info("research waiting — no brain client: %s", e)
            return
        for item in pending:
            try:
                findings = _answer(client, item["question"], item["topic_name"])
                if findings:
                    self.vault.write_research_answer(
                        item["topic_id"], item["question"], findings)
                    log.info("researched: %s", item["question"][:60])
            except Exception as e:
                log.warning("research failed for %r: %s", item["question"][:60], e)
