"""
Video processing pipeline: upload → frame extraction → YOLO detection → CLIP embeddings.
"""

from __future__ import annotations

import asyncio
import math
import time
import uuid
from pathlib import Path
from typing import Callable, Iterator

import cv2
import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer
from ultralytics import YOLO

from config import (
    CLIP_MODEL,
    FRAME_SAMPLE_FPS,
    KEYFRAME_SCORE_THRESHOLD,
    KEYFRAMES_DIR,
    VIDEOS_DIR,
    YOLO_CONF_THRESHOLD,
    YOLO_MODEL,
    YOLO_TRACKER,
)

# ---------------------------------------------------------------------------
# Lazy model singletons — loaded once on first use
# ---------------------------------------------------------------------------

_yolo: YOLO | None = None
_clip: SentenceTransformer | None = None


def _get_yolo() -> YOLO:
    global _yolo
    if _yolo is None:
        _yolo = YOLO(YOLO_MODEL)
    return _yolo


def _reset_tracker(model: YOLO) -> None:
    """Drop tracker state from any previous video.

    model.track(..., persist=True) keeps Kalman-filter / track-history state
    on model.predictor across calls so IDs stay stable frame-to-frame within
    one video. Since _yolo is a singleton reused across uploads, that state
    must be wiped before each new video or track IDs would carry over.
    """
    model.predictor = None


def _get_clip() -> SentenceTransformer:
    global _clip
    if _clip is None:
        _clip = SentenceTransformer(CLIP_MODEL)
    return _clip


# ---------------------------------------------------------------------------
# Data classes (plain dicts for JSON-serialisability)
# ---------------------------------------------------------------------------

def _make_detection(
    cls_name: str, confidence: float, bbox: list[float], track_id: int | None
) -> dict:
    return {
        "class": cls_name,
        "confidence": round(confidence, 4),
        "bbox": bbox,
        "track_id": track_id,
    }


def _make_frame_record(
    video_id: str,
    frame_idx: int,
    timestamp_sec: float,
    detections: list[dict],
    is_keyframe: bool,
    embedding: list[float] | None,
) -> dict:
    return {
        "video_id": video_id,
        "frame_idx": frame_idx,
        "timestamp_sec": round(timestamp_sec, 3),
        "detections": detections,
        "is_keyframe": is_keyframe,
        "embedding": embedding,
    }


# ---------------------------------------------------------------------------
# Frame extraction
# ---------------------------------------------------------------------------

def _sample_frames(video_path: Path, fps: float) -> Iterator[tuple[int, float, np.ndarray]]:
    """Yield (frame_idx, timestamp_sec, bgr_frame) at target FPS."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(native_fps / fps))
    frame_idx = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % step == 0:
                timestamp = frame_idx / native_fps
                yield frame_idx, timestamp, frame
            frame_idx += 1
    finally:
        cap.release()


# ---------------------------------------------------------------------------
# YOLO detection + tracking
# ---------------------------------------------------------------------------

def _track(frame_bgr: np.ndarray) -> list[dict]:
    """Detect objects and assign persistent track IDs via ByteTrack.

    persist=True tells ultralytics this frame continues the sequence from
    the previous call, so it matches new boxes against the tracks it's
    already carrying rather than starting fresh each frame.
    """
    model = _get_yolo()
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    results = model.track(
        rgb,
        conf=YOLO_CONF_THRESHOLD,
        tracker=YOLO_TRACKER,
        persist=True,
        verbose=False,
    )[0]

    detections = []
    for box in results.boxes:
        cls_id = int(box.cls[0])
        cls_name = results.names[cls_id]
        conf = float(box.conf[0])
        # box.id is None for a detection the tracker hasn't confirmed/matched yet
        track_id = int(box.id[0]) if box.id is not None else None
        x1, y1, x2, y2 = (round(v, 1) for v in box.xyxy[0].tolist())
        detections.append(_make_detection(cls_name, conf, [x1, y1, x2, y2], track_id))

    return detections


# ---------------------------------------------------------------------------
# CLIP embedding + keyframe selection
# ---------------------------------------------------------------------------

def _embed_frame(frame_bgr: np.ndarray) -> list[float]:
    model = _get_clip()
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img = Image.fromarray(rgb)
    vec: np.ndarray = model.encode(img, convert_to_numpy=True)  # type: ignore[arg-type]
    return vec.tolist()


def _cosine_sim(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


def _is_keyframe(embedding: list[float], last_keyframe_emb: list[float] | None) -> bool:
    if last_keyframe_emb is None:
        return True
    sim = _cosine_sim(embedding, last_keyframe_emb)
    return (1.0 - sim) >= KEYFRAME_SCORE_THRESHOLD


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def save_upload(file_bytes: bytes, original_filename: str) -> tuple[str, Path]:
    """Persist raw upload; returns (video_id, path)."""
    video_id = str(uuid.uuid4())
    suffix = Path(original_filename).suffix or ".mp4"
    dest = VIDEOS_DIR / f"{video_id}{suffix}"

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, dest.write_bytes, file_bytes)
    return video_id, dest


def _video_duration_sec(video_path: Path) -> float | None:
    """Best-effort total duration so progress can be reported as % of runtime."""
    cap = cv2.VideoCapture(str(video_path))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if fps > 0 and frame_count > 0:
            return frame_count / fps
        return None
    finally:
        cap.release()


def process_video(
    video_id: str,
    video_path: Path,
    on_progress: Callable[[int], None] | None = None,
) -> list[dict]:
    """
    Full pipeline: extract frames → detect objects → embed keyframes.
    Returns list of frame records (dicts) ready for storage.
    """
    records: list[dict] = []
    last_kf_emb: list[float] | None = None
    _reset_tracker(_get_yolo())

    duration_sec = _video_duration_sec(video_path)
    start_time = time.monotonic()
    last_reported = -1

    for frame_idx, timestamp, frame_bgr in _sample_frames(video_path, FRAME_SAMPLE_FPS):
        detections = _track(frame_bgr)
        embedding = _embed_frame(frame_bgr)

        if on_progress:
            if duration_sec:
                pct = min(99, int(timestamp / duration_sec * 100))
            else:
                # cv2 can't report a frame count/fps for some containers (common
                # with phone/browser-recorded video) — fall back to a saturating
                # time curve so the bar still moves instead of sitting at 0.
                elapsed = time.monotonic() - start_time
                pct = min(95, int(100 * (1 - math.exp(-elapsed / 30))))
            if pct != last_reported:
                on_progress(pct)
                last_reported = pct

        time_kf = (int(timestamp) % 10 == 0)  # always keep one frame every 10s
        kf = _is_keyframe(embedding, last_kf_emb) or time_kf
        if kf:
            last_kf_emb = embedding
            kf_path = KEYFRAMES_DIR / video_id
            kf_path.mkdir(exist_ok=True)
            cv2.imwrite(str(kf_path / f"{frame_idx:06d}.jpg"), frame_bgr)

        records.append(
            _make_frame_record(
                video_id=video_id,
                frame_idx=frame_idx,
                timestamp_sec=timestamp,
                detections=detections,
                is_keyframe=kf,
                embedding=embedding if kf else None,
            )
        )

    return records
