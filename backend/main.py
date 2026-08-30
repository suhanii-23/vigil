"""FastAPI entrypoint — routes wired here, logic lives in processor/storage/router."""

from __future__ import annotations

import asyncio
import json
from functools import partial
from pathlib import Path

import anthropic
import openai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from config import CORS_ORIGINS, JOBS_FILE, VIDEOS_DIR
from processor import process_video, save_upload
from router import MissingAPIKeyError, UnknownProviderError, answer
from storage import delete_video_data, save_frame_records

app = FastAPI(title="Vigil API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Persistent job store
# ---------------------------------------------------------------------------

def _load_jobs() -> dict[str, dict]:
    if JOBS_FILE.exists():
        try:
            return json.loads(JOBS_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_jobs(jobs: dict[str, dict]) -> None:
    JOBS_FILE.write_text(json.dumps(jobs, indent=2))


_jobs: dict[str, dict] = _load_jobs()


def _set_job(video_id: str, data: dict) -> None:
    _jobs[video_id] = data
    _save_jobs(_jobs)


def _set_progress(video_id: str, pct: int) -> None:
    """Called from the executor thread running process_video — updates the
    existing job in place rather than replacing it, so status/video_path
    (set by _run_pipeline) survive concurrent progress ticks."""
    job = _jobs.get(video_id)
    if job is None:
        return
    job["progress"] = pct
    _save_jobs(_jobs)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload_video(file: UploadFile):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    file_bytes = await file.read()
    video_id, video_path = await save_upload(file_bytes, file.filename or "upload.mp4")

    _set_job(video_id, {"status": "processing", "progress": 0, "video_path": str(video_path)})
    asyncio.create_task(_run_pipeline(video_id, video_path))

    return {"video_id": video_id, "status": "processing"}


@app.get("/status/{video_id}")
async def get_status(video_id: str):
    job = _jobs.get(video_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return {k: v for k, v in job.items() if k != "video_path"}


@app.get("/videos")
async def list_videos():
    """Return all processed videos so the frontend can restore sessions."""
    return [
        {"video_id": vid, **{k: v for k, v in job.items() if k != "video_path"}}
        for vid, job in _jobs.items()
        if job.get("status") == "ready"
    ]


class ChatRequest(BaseModel):
    video_id: str
    query: str
    history: list[dict] = []
    provider: str = "anthropic"  # BYOK — which provider the user's key is for
    api_key: str | None = None   # BYOK — user's own key from the frontend


@app.post("/chat")
async def chat(req: ChatRequest):
    job = _jobs.get(req.video_id)
    if job is None or job.get("status") != "ready":
        raise HTTPException(status_code=400, detail="Video not ready — wait for processing to complete")
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, answer, req.video_id, req.query, req.history, job.get("video_path"),
            req.provider, req.api_key,
        )
    except MissingAPIKeyError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except UnknownProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (anthropic.AuthenticationError, openai.AuthenticationError) as exc:
        raise HTTPException(
            status_code=401, detail="That API key was rejected by the provider — double-check it and try again."
        ) from exc
    return result


@app.delete("/video/{video_id}")
async def delete_video(video_id: str):
    delete_video_data(video_id)
    _jobs.pop(video_id, None)
    _save_jobs(_jobs)
    return {"deleted": video_id}


async def _run_pipeline(video_id: str, video_path: Path) -> None:
    loop = asyncio.get_event_loop()
    try:
        pipeline = partial(process_video, video_id, video_path, on_progress=partial(_set_progress, video_id))
        records = await loop.run_in_executor(None, pipeline)
        await loop.run_in_executor(None, save_frame_records, video_id, records)
        _set_job(video_id, {
            "status": "ready",
            "frame_count": len(records),
            "keyframe_count": sum(1 for r in records if r["is_keyframe"]),
            "video_path": str(video_path),
        })
    except Exception as exc:
        _set_job(video_id, {"status": "error", "detail": str(exc), "video_path": str(video_path)})
