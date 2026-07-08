"""The filing brain: matches a brain-dump against the vault and decides where it goes.

Two tiers:
  - Claude (claude-opus-4-8) when API credentials are available — real semantic filing.
  - A lexical fallback (token overlap) so the pipe still works with no credentials,
    at honest low confidence.
"""
import os
import re
from typing import List, Optional

from pydantic import BaseModel

CONFIDENCE_BAR = float(os.environ.get("CEREMONY_CONFIDENCE", "0.75"))
MODEL = os.environ.get("CEREMONY_MODEL", "claude-opus-4-8")


class FilingDecision(BaseModel):
    topic_id: str
    new_topic_name: Optional[str] = None
    confidence: float
    cleaned_text: str
    summary: str
    research: List[str] = []


SYSTEM = """You are the filing agent for Ceremony, a self-organizing markdown notebook.
The user speaks or types raw brain-dumps; you file each one into the vault's topic pages.

Rules:
- Pick the existing topic that best matches the dump. Use topic_id "NEW" with a
  new_topic_name only when the dump clearly deserves its own page and fits nowhere.
- confidence is your honest 0-1 estimate that the user would agree with the filing.
  Below {bar} the dump is held for the user's judgement instead of filed.
- cleaned_text: the user's thinking, lightly cleaned (fix transcription stumbles,
  drop filler words) — NEVER invent, summarize away, or add content. Keep their voice.
- summary: one line, <=70 chars, for the commit message and ledger.
- research: only what the user flagged with //research (or an unmistakable request
  to look something up). Each item is a short research query. Usually empty.
- Personal diary-like reflection goes to journal. Unclaimed sparks go to ideas.
""".format(bar=CONFIDENCE_BAR)


class Brain:
    def __init__(self):
        self._client = None
        self._auth_failed = False
        self.last_mode = None
        self.last_error = None

    def client(self):
        """The shared Anthropic client — also used by research and reweave."""
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic()
        return self._client

    _get_client = client  # old name, kept for callers/tests

    def decide(self, text: str, topics: list[dict], excerpts: dict[str, str]) -> FilingDecision:
        if not self._auth_failed:
            try:
                decision = self._claude(text, topics, excerpts)
                self.last_mode = "claude"
                self.last_error = None
                return decision
            except Exception as e:
                import anthropic
                if isinstance(e, anthropic.AuthenticationError):
                    self._auth_failed = True
                # a transient failure (rate limit, network) falls through to the
                # lexical tier for THIS dump only — and is recorded, not swallowed,
                # so /api/state can say why the brain went lexical
                self.last_error = f"{type(e).__name__}: {e}"[:300]
        self.last_mode = "lexical"
        return self._lexical(text, topics, excerpts)

    # ---------- Claude ----------

    def _claude(self, text: str, topics: list[dict], excerpts: dict[str, str]) -> FilingDecision:
        client = self._get_client()
        topic_lines = []
        for t in topics:
            excerpt = (excerpts.get(t["id"]) or "").strip().replace("\n", " ")[:400]
            topic_lines.append(f'- id "{t["id"]}" · {t["name"]} — {t.get("definition", "")}'
                               + (f'\n  recent notes: {excerpt}' if excerpt else ""))
        prompt = (
            "The vault's topics:\n" + "\n".join(topic_lines) +
            "\n\nThe raw dump to file:\n<dump>\n" + text + "\n</dump>"
        )
        response = client.messages.parse(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_format=FilingDecision,
        )
        decision = response.parsed_output
        valid_ids = {t["id"] for t in topics}
        if decision.topic_id != "NEW" and decision.topic_id not in valid_ids:
            by_name = next((t for t in topics if t["name"] == decision.topic_id), None)
            decision.topic_id = by_name["id"] if by_name else "in"
        if decision.topic_id == "NEW" and not decision.new_topic_name:
            decision.topic_id = "in"
        decision.confidence = max(0.0, min(1.0, decision.confidence))
        return decision

    # ---------- lexical fallback ----------

    def _lexical(self, text: str, topics: list[dict], excerpts: dict[str, str]) -> FilingDecision:
        words = self._tokens(text)
        best, second, best_topic = 0.0, 0.0, topics[-1]
        for t in topics:
            corpus = self._tokens(t["name"] + " " + t.get("definition", "") + " " +
                                  (excerpts.get(t["id"]) or ""))
            score = len(words & corpus)
            if t["name"].lower() in text.lower():
                score += 3
            if score > best:
                best, second, best_topic = score, best, t
            elif score > second:
                second = score
        if best == 0:
            best_topic = next((t for t in topics if t["id"] == "in"), topics[-1])
            confidence = 0.35
        else:
            confidence = min(0.7, 0.4 + 0.3 * (best - second) / best)

        research = [s.replace("//research", "").strip(" .—-")
                    for s in re.split(r"(?<=[.!?])\s+", text) if "//research" in s]
        summary = re.sub(r"\s+", " ", text).strip()
        summary = summary[:70] + ("…" if len(summary) > 70 else "")
        return FilingDecision(
            topic_id=best_topic["id"], confidence=round(confidence, 2),
            cleaned_text=text.strip(), summary=summary, research=research,
        )

    @staticmethod
    def _tokens(s: str) -> set[str]:
        return {w for w in re.findall(r"[a-zA-Z']+", s.lower()) if len(w) > 3}
