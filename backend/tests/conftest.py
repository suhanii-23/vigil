import pytest

import storage


@pytest.fixture
def tmp_storage(tmp_path, monkeypatch):
    """Point storage.py at an isolated tmp directory instead of backend/data/,
    and reset its cached ChromaDB client/collection.

    storage._collection is a module-level singleton (same pattern as the YOLO
    model singleton in processor.py) — if we don't reset it, a test would
    keep querying whichever directory the *first* test happened to open.
    """
    metadata_dir = tmp_path / "metadata"
    chroma_dir = tmp_path / "chroma"
    metadata_dir.mkdir()
    chroma_dir.mkdir()

    monkeypatch.setattr(storage, "METADATA_DIR", metadata_dir)
    monkeypatch.setattr(storage, "CHROMA_DIR", chroma_dir)
    monkeypatch.setattr(storage, "_chroma_client", None)
    monkeypatch.setattr(storage, "_collection", None)
