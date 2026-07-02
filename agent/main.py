"""Ceremony agent — FastAPI service that owns the vault.

Run:  uvicorn main:app --port 8014   (from this directory, venv active)

API contract (per the design handoff):
  GET  /api/state                      vault, topics, ledger (parsed git log), queue
  POST /api/dump {text}                -> filed {commit, topic, excerpt, research[]}
                                          or held {queued: true, entry}
  POST /api/queue/{id}/rule {action, topic_id?}   approve | redirect | discard | undo
  POST /api/revert {commit}            git revert
  POST /api/refile {commit, topic_id}  move a filed dump to another topic
  POST /api/topics/{id}/recode {color} code / recode a topic
"""
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from brain import Brain, CONFIDENCE_BAR
from vault import Vault, _append_section  # noqa: F401

# When CEREMONY_TOKEN is set (hosted deployments), every /api request must
# carry `Authorization: Bearer <token>`. Unset = open, for localhost dev.
AUTH_TOKEN = os.environ.get("CEREMONY_TOKEN", "")

app = FastAPI(title="ceremony-agent")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def require_token(request, call_next):
    if (
        AUTH_TOKEN
        and request.url.path.startswith("/api")
        and request.method != "OPTIONS"  # CORS preflight carries no auth header
        and request.headers.get("authorization") != f"Bearer {AUTH_TOKEN}"
    ):
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)

vault = Vault()
brain = Brain()


class DumpIn(BaseModel):
    text: str


class RuleIn(BaseModel):
    action: str
    topic_id: str | None = None


class RevertIn(BaseModel):
    commit: str


class RefileIn(BaseModel):
    commit: str
    topic_id: str


class RecodeIn(BaseModel):
    color: str


def _excerpts() -> dict[str, str]:
    out = {}
    for t in vault.topics():
        page = vault.page_path(t)
        if page.exists():
            content = page.read_text()
            m = re.search(r"## Notes\n(.*?)(?=\n## |\Z)", content, re.S)
            notes = (m.group(1) if m else "").strip()
            out[t["id"]] = notes[-600:]
    return out


@app.get("/api/state")
def state():
    s = vault.state()
    s["brain"] = brain.last_mode or ("claude?" if not brain._auth_failed else "lexical")
    s["confidenceBar"] = CONFIDENCE_BAR
    return s


def _process_dump(text: str, audio: bytes | None = None, audio_ext: str = "webm"):
    decision = brain.decide(text, vault.topics(), _excerpts())

    if decision.topic_id == "NEW" and decision.new_topic_name:
        topic = vault.create_topic(decision.new_topic_name, definition=decision.summary)
    else:
        topic = vault.topic(decision.topic_id) or vault.topic("in")

    excerpt = decision.cleaned_text
    if len(excerpt) > 150:
        excerpt = excerpt[:150].strip() + "…"

    if decision.confidence >= CONFIDENCE_BAR:
        commit = vault.file_dump(
            text, topic, decision.cleaned_text, decision.summary,
            decision.research, decision.confidence,
            audio=audio, audio_ext=audio_ext,
        )
        return {
            "queued": False, "commit": commit,
            "topicId": topic["id"], "topicName": topic["name"],
            "excerpt": excerpt, "research": decision.research,
            "confidence": decision.confidence, "brain": brain.last_mode,
        }

    commit, entry = vault.queue_add(
        text, decision.cleaned_text, decision.summary,
        topic["id"], decision.confidence, decision.research,
        audio=audio, audio_ext=audio_ext,
    )
    return {"queued": True, "commit": commit, "entry": entry,
            "topicId": topic["id"], "topicName": topic["name"],
            "confidence": decision.confidence, "brain": brain.last_mode}


@app.post("/api/dump")
def dump(body: DumpIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "empty dump")
    return _process_dump(text)


AUDIO_EXTS = {"audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3",
              "audio/ogg": "ogg", "audio/wav": "wav"}


@app.post("/api/dump-audio")
async def dump_audio(audio: UploadFile = File(...), text: str = Form("")):
    """A dump with its raw audio. The transcript files as usual; the audio is
    kept in the vault so a bad transcript is recoverable — nothing is lost."""
    data = await audio.read()
    if not data:
        raise HTTPException(400, "empty audio")
    mime = (audio.content_type or "").split(";")[0].strip()
    ext = AUDIO_EXTS.get(mime) or (Path(audio.filename).suffix.lstrip(".") if audio.filename else "") or "webm"
    return _process_dump(text.strip() or "(audio only — no transcript)", audio=data, audio_ext=ext)


@app.post("/api/queue/{entry_id}/rule")
def rule(entry_id: str, body: RuleIn):
    try:
        entry = vault.queue_rule(entry_id, body.action, body.topic_id)
    except StopIteration:
        raise HTTPException(404, "no such queue entry")
    return {"entry": entry}


@app.post("/api/revert")
def revert(body: RevertIn):
    commit = vault.revert(body.commit)
    return {"commit": commit}


@app.post("/api/refile")
def refile(body: RefileIn):
    new_commit, topic = vault.refile(body.commit, body.topic_id)
    return {"commit": new_commit, "topicId": topic["id"], "topicName": topic["name"]}


@app.post("/api/topics/{topic_id}/recode")
def recode(topic_id: str, body: RecodeIn):
    if not vault.topic(topic_id):
        raise HTTPException(404, "no such topic")
    commit = vault.recode(topic_id, body.color)
    return {"commit": commit}


# Hosted deployments bake the PWA build into agent/static so one app serves
# both. Mounted last — /api routes take precedence. Absent in local dev.
STATIC_DIR = Path(os.environ.get("CEREMONY_STATIC", Path(__file__).resolve().parent / "static"))
if STATIC_DIR.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="pwa")
