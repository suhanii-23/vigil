"""
Persistence layer: JSONL metadata + ChromaDB vector store.
"""

from __future__ import annotations

import json
from pathlib import Path

import chromadb
from chromadb.config import Settings

from config import CHROMA_COLLECTION, CHROMA_DIR, METADATA_DIR

# ---------------------------------------------------------------------------
# ChromaDB client (persistent, local)
# ---------------------------------------------------------------------------

_chroma_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None


def _get_collection() -> chromadb.Collection:
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ---------------------------------------------------------------------------
# JSONL helpers
# ---------------------------------------------------------------------------

def _metadata_path(video_id: str) -> Path:
    return METADATA_DIR / f"{video_id}.jsonl"


def _write_jsonl(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")


def read_metadata(video_id: str) -> list[dict]:
    path = _metadata_path(video_id)
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_frame_records(video_id: str, records: list[dict]) -> None:
    """
    Persists all frame records as JSONL and upserts keyframe embeddings
    into ChromaDB.
    """
    # Strip embeddings from JSONL to keep file sizes sane; store a flag only.
    slim_records = []
    for rec in records:
        slim = {k: v for k, v in rec.items() if k != "embedding"}
        slim_records.append(slim)

    _write_jsonl(_metadata_path(video_id), slim_records)

    # Upsert keyframes into ChromaDB
    keyframes = [r for r in records if r.get("is_keyframe") and r.get("embedding")]
    if not keyframes:
        return

    collection = _get_collection()
    collection.upsert(
        ids=[f"{r['video_id']}_{r['frame_idx']}" for r in keyframes],
        embeddings=[r["embedding"] for r in keyframes],
        metadatas=[
            {
                "video_id": r["video_id"],
                "frame_idx": r["frame_idx"],
                "timestamp_sec": r["timestamp_sec"],
                # Flatten detection class list for filtering
                "classes": ",".join(
                    {d["class"] for d in r["detections"]}
                ),
            }
            for r in keyframes
        ],
    )


def query_embeddings(
    query_embedding: list[float],
    video_id: str,
    n_results: int = 5,
) -> list[dict]:
    """
    Return the top-n keyframe metadata records nearest to query_embedding
    for a given video.
    """
    collection = _get_collection()
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where={"video_id": video_id},
        include=["metadatas", "distances"],
    )

    hits = []
    for meta, dist in zip(
        results["metadatas"][0],   # type: ignore[index]
        results["distances"][0],   # type: ignore[index]
    ):
        hits.append({**meta, "distance": round(dist, 4)})

    return hits


def delete_video_data(video_id: str) -> None:
    """Remove all stored data for a video (JSONL + ChromaDB entries)."""
    path = _metadata_path(video_id)
    if path.exists():
        path.unlink()

    collection = _get_collection()
    existing = collection.get(where={"video_id": video_id}, include=[])
    if existing["ids"]:
        collection.delete(ids=existing["ids"])
