"""
Hybrid RAG router:
  1. Classify query → structured | semantic | hybrid
  2. Structured path: scan JSONL metadata (counts, classes, timestamps)
  3. Semantic path: CLIP-embed query → ChromaDB nearest frames
  4. Hybrid: both, Claude synthesises
"""

from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Literal

import anthropic
import cv2
from sentence_transformers import SentenceTransformer

from config import CLAUDE_MODEL, CLIP_MODEL, KEYFRAMES_DIR
from storage import query_embeddings, read_metadata

# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------

_anthropic: anthropic.Anthropic | None = None
_clip: SentenceTransformer | None = None


class MissingAPIKeyError(Exception):
    """Raised when no Anthropic key is available — neither a user-supplied
    (BYOK) key nor the server's own .env fallback."""


def _client(api_key: str | None = None) -> anthropic.Anthropic:
    """Build an Anthropic client for this request.

    A BYOK frontend user's key is never cached across requests — different
    visitors supply different keys, so each gets its own fresh client. Only
    the server's own fallback key (from .env, kept for local-dev
    convenience) is cached as a singleton, since that one is constant.
    """
    if api_key:
        return anthropic.Anthropic(api_key=api_key)

    global _anthropic
    if _anthropic is None:
        env_key = os.environ.get("ANTHROPIC_API_KEY")
        if not env_key:
            raise MissingAPIKeyError(
                "No Anthropic API key available — add your own key to use chat."
            )
        _anthropic = anthropic.Anthropic(api_key=env_key)
    return _anthropic


def _get_clip() -> SentenceTransformer:
    global _clip
    if _clip is None:
        _clip = SentenceTransformer(CLIP_MODEL)
    return _clip


# ---------------------------------------------------------------------------
# Route type
# ---------------------------------------------------------------------------

Route = Literal["structured", "semantic", "hybrid"]

_CLASSIFIER_SYSTEM = """\
You are a query classifier for a video question-answering system.
Given a user question about a video, output exactly one word: the query route.

Routes:
- structured  → questions about counts, presence/absence of objects, specific
                 timestamps, or object classes (e.g. "how many cars", "when did
                 the dog appear", "were there any people")
- semantic    → questions about scenes, moods, aesthetics, or vague descriptions
                 (e.g. "what is the overall atmosphere", "find a calm outdoor moment")
- hybrid      → questions that need both (e.g. "how many frames had crowds and
                 what did the crowd scenes look like")

Output only the single word with no punctuation or explanation."""


def _classify(query: str, api_key: str | None = None) -> Route:
    resp = _client(api_key).messages.create(
        model=CLAUDE_MODEL,
        max_tokens=10,
        system=_CLASSIFIER_SYSTEM,
        messages=[{"role": "user", "content": query}],
    )
    word = resp.content[0].text.strip().lower()  # type: ignore[union-attr]
    if word in ("structured", "semantic", "hybrid"):
        return word  # type: ignore[return-value]
    # Default to hybrid if the classifier produces something unexpected
    return "hybrid"


# ---------------------------------------------------------------------------
# Structured path — aggregate JSONL metadata
# ---------------------------------------------------------------------------

def _structured_context(video_id: str, query: str) -> str:
    records = read_metadata(video_id)
    if not records:
        return "No metadata found for this video."

    # Build a compact summary: total frames, class counts, first/last appearance.
    # class_counts = raw detection events (same object seen in N frames = N events).
    # class_tracks = unique ByteTrack IDs per class — the actual object count.
    class_counts: dict[str, int] = {}
    class_tracks: dict[str, set[int]] = {}
    class_first: dict[str, float] = {}
    class_last: dict[str, float] = {}
    total_frames = len(records)
    duration = records[-1]["timestamp_sec"] if records else 0.0

    for rec in records:
        ts = rec["timestamp_sec"]
        for det in rec.get("detections", []):
            cls = det["class"]
            class_counts[cls] = class_counts.get(cls, 0) + 1
            track_id = det.get("track_id")
            if track_id is not None:
                class_tracks.setdefault(cls, set()).add(track_id)
            if cls not in class_first:
                class_first[cls] = ts
            class_last[cls] = ts

    lines = [
        f"Video stats: {total_frames} sampled frames, duration ~{duration:.1f}s",
        "",
        "Detected objects (unique tracked instances, not raw per-frame detections):",
    ]
    for cls, cnt in sorted(class_counts.items(), key=lambda x: -x[1]):
        unique = len(class_tracks.get(cls, set()))
        first = class_first[cls]
        last = class_last[cls]
        lines.append(
            f"  {cls}: {unique} unique (from {cnt} detection events across frames), "
            f"first at {first:.1f}s, last at {last:.1f}s"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Semantic path — CLIP query embedding → ChromaDB
# ---------------------------------------------------------------------------

def _semantic_hits(video_id: str, query: str, n_results: int = 5) -> list[dict]:
    clip = _get_clip()
    embedding: list[float] = clip.encode(query, convert_to_numpy=True).tolist()  # type: ignore[union-attr]
    return query_embeddings(embedding, video_id, n_results=n_results)


def _semantic_context(hits: list[dict]) -> str:
    if not hits:
        return "No visually similar frames found."

    lines = ["Visually relevant frames (nearest semantic matches):"]
    for h in hits:
        lines.append(
            f"  t={h['timestamp_sec']:.1f}s  frame={h['frame_idx']}  "
            f"classes=[{h.get('classes', '')}]  dist={h['distance']:.4f}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Synthesis — Claude answers using the retrieved context
# ---------------------------------------------------------------------------

def _parse_timestamp(query: str) -> float | None:
    """Extract a timestamp in seconds from a query string.

    Handles: '45s', '1:30', '1m30s', 'at 90 seconds', '0:45'.
    """
    # mm:ss or hh:mm:ss
    m = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b', query)
    if m:
        parts = [int(x) for x in m.groups() if x is not None]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    # Xm Ys
    m = re.search(r'(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+)\s*s(?:ec(?:ond)?s?)?', query, re.I)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    # Xm
    m = re.search(r'(\d+)\s*m(?:in(?:ute)?s?)?\b', query, re.I)
    if m:
        return int(m.group(1)) * 60
    # Xs or X seconds
    m = re.search(r'(\d+)\s*s(?:ec(?:ond)?s?)?\b', query, re.I)
    if m:
        return float(m.group(1))
    return None


def _frames_around_timestamp(
    video_path: str, timestamp_sec: float, window_sec: float = 30.0, n_frames: int = 5
) -> list[dict]:
    """Return n_frames evenly spaced in [timestamp - window, timestamp + window].

    This gives Claude before/after context so it can say whether an event
    already happened, is in progress, or hasn't occurred yet.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []
    duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / (cap.get(cv2.CAP_PROP_FPS) or 30.0)
    start = max(0.0, timestamp_sec - window_sec)
    end = min(duration, timestamp_sec + window_sec)
    times = [start + i * (end - start) / max(n_frames - 1, 1) for i in range(n_frames)]
    blocks = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ret, frame = cap.read()
        if not ret:
            continue
        _, buf = cv2.imencode(".jpg", frame)
        data = base64.standard_b64encode(buf.tobytes()).decode()
        blocks.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": data},
        })
    cap.release()
    return blocks


def _relevant_frames(
    video_id: str, semantic_hits: list[dict], max_images: int = 16
) -> list[dict]:
    """Return Anthropic image content blocks Claude should actually see.

    Two sources, combined:
      1. The frames ChromaDB's semantic search matched to the query — these
         are query-relevant, but on their own would ignore everything else
         in the video.
      2. Frames evenly spaced across the *entire* keyframe timeline, filling
         whatever slots are left — this guarantees full-video coverage.

    Previously this just grabbed the first N keyframes by filename (=
    chronological) order, so any video with more than N keyframes silently
    lost all visual evidence past the first N seconds, and the semantic
    search results were never actually shown to Claude as images — only
    described in text.
    """
    kf_dir = KEYFRAMES_DIR / video_id
    if not kf_dir.exists():
        return []
    all_paths = sorted(kf_dir.glob("*.jpg"))
    if not all_paths:
        return []

    chosen: list[Path] = []
    seen: set[Path] = set()
    for h in semantic_hits:
        p = kf_dir / f"{h['frame_idx']:06d}.jpg"
        if p.exists() and p not in seen:
            chosen.append(p)
            seen.add(p)

    remaining = max_images - len(chosen)
    if remaining > 0:
        n = min(remaining, len(all_paths))
        idxs = {round(i * (len(all_paths) - 1) / max(n - 1, 1)) for i in range(n)}
        for i in sorted(idxs):
            p = all_paths[i]
            if p not in seen:
                chosen.append(p)
                seen.add(p)

    blocks = []
    for p in chosen[:max_images]:
        data = base64.standard_b64encode(p.read_bytes()).decode()
        blocks.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": data},
        })
    return blocks


_ANSWER_SYSTEM = """\
You are Vigil, an AI video intelligence assistant. Answer questions about uploaded videos \
using only the retrieved evidence provided.

Formatting rules:
- Lead with a single bold verdict sentence (e.g. "**No unusual activity detected.**" or \
"**Unusual activity detected.**")
- Follow with 2–4 tight bullet points — each one fact grounded in the evidence, no filler
- If something is notable or alarming, put it in its own "⚠️ Notable:" bullet
- End with one short plain-English summary sentence
- No headers, no nested lists, no emoji overload — clean and scannable
- If evidence is insufficient, say so in one sentence and stop"""


def _synthesise(
    query: str,
    context: str,
    history: list[dict],
    video_id: str | None = None,
    video_path: str | None = None,
    semantic_hits: list[dict] | None = None,
    api_key: str | None = None,
) -> str:
    messages: list[dict] = []
    semantic_hits = semantic_hits or []

    # Include previous turns if any
    for turn in history:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    # Build current user message: images first, then text evidence + question
    # If query targets a specific timestamp, show that exact frame; else show
    # semantic-search hits plus frames spanning the whole video
    ts = _parse_timestamp(query)
    if ts is not None and video_path:
        image_blocks = _frames_around_timestamp(video_path, ts) or _relevant_frames(
            video_id or "", semantic_hits
        )
    else:
        image_blocks = _relevant_frames(video_id or "", semantic_hits) if video_id else []
    user_content: list[dict] = []
    if image_blocks:
        user_content.extend(image_blocks)
    img_label = (
        f"Frames spanning ±30s around the {ts:.1f}s mark (ordered chronologically — before, at, and after the requested moment)."
        if ts is not None and image_blocks
        else "Frames most relevant to the question, plus frames spanning the full video for coverage."
    )
    user_content.append({
        "type": "text",
        "text": (
            f"{img_label}\n\n"
            f"Detection metadata:\n{context}\n\n"
            f"Question: {query}"
        ),
    })
    messages.append({"role": "user", "content": user_content})

    resp = _client(api_key).messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=_ANSWER_SYSTEM,
        messages=messages,
    )
    return resp.content[0].text.strip()  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def answer(
    video_id: str,
    query: str,
    history: list[dict] | None = None,
    video_path: str | None = None,
    api_key: str | None = None,
) -> dict:
    """
    Route the query, retrieve evidence, and return a dict with:
      { answer: str, route: str, context: str }
    """
    if history is None:
        history = []

    route = _classify(query, api_key=api_key)

    hits: list[dict] = []
    if route == "structured":
        context = _structured_context(video_id, query)
    elif route == "semantic":
        hits = _semantic_hits(video_id, query)
        context = _semantic_context(hits)
    else:  # hybrid
        struct = _structured_context(video_id, query)
        hits = _semantic_hits(video_id, query)
        sem = _semantic_context(hits)
        context = f"[Structured metadata]\n{struct}\n\n[Semantic frame matches]\n{sem}"

    text = _synthesise(
        query, context, history, video_id=video_id, video_path=video_path, semantic_hits=hits,
        api_key=api_key,
    )

    return {"answer": text, "route": route, "context": context}
