import pytest

import router


# ---------------------------------------------------------------------------
# _parse_timestamp — pure function, no mocking needed
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "query,expected",
    [
        ("what happened at 45s", 45.0),
        ("what happened at 1:30", 90),
        ("look at 0:45", 45),
        ("check 1m30s", 90),
        ("anything at 2m", 120),
        ("no timestamp mentioned here", None),
    ],
)
def test_parse_timestamp(query, expected):
    assert router._parse_timestamp(query) == expected


# ---------------------------------------------------------------------------
# _structured_context — the aggregation logic behind object counting.
# We fake out storage.read_metadata (via router's imported reference) so this
# tests pure aggregation, not file I/O.
# ---------------------------------------------------------------------------

def test_structured_context_no_metadata(monkeypatch):
    monkeypatch.setattr(router, "read_metadata", lambda video_id: [])
    assert router._structured_context("vid", "any query") == "No metadata found for this video."


def test_structured_context_counts_unique_tracks_not_raw_events(monkeypatch):
    """Regression test for the overcounting bug: the same tracked person
    detected across 3 frames must count as 1 person, not 3."""
    records = [
        {
            "timestamp_sec": 0.0,
            "detections": [
                {"class": "person", "track_id": 1},
                {"class": "person", "track_id": 2},
            ],
        },
        {"timestamp_sec": 0.5, "detections": [{"class": "person", "track_id": 1}]},
        {
            "timestamp_sec": 1.0,
            "detections": [
                {"class": "person", "track_id": 1},
                {"class": "car", "track_id": None},  # never confirmed by the tracker
            ],
        },
    ]
    monkeypatch.setattr(router, "read_metadata", lambda video_id: records)

    context = router._structured_context("vid", "how many people?")

    assert "person: 2 unique (from 4 detection events across frames), first at 0.0s, last at 1.0s" in context
    assert "car: 0 unique (from 1 detection events across frames), first at 1.0s, last at 1.0s" in context


def test_structured_context_orders_by_event_count_descending(monkeypatch):
    records = [
        {
            "timestamp_sec": 0.0,
            "detections": [
                {"class": "car", "track_id": 1},
                {"class": "person", "track_id": 1},
                {"class": "person", "track_id": 2},
            ],
        }
    ]
    monkeypatch.setattr(router, "read_metadata", lambda video_id: records)

    context = router._structured_context("vid", "what's here?")
    lines = context.splitlines()

    person_line = next(i for i, l in enumerate(lines) if l.strip().startswith("person"))
    car_line = next(i for i, l in enumerate(lines) if l.strip().startswith("car"))
    assert person_line < car_line  # 2 person events > 1 car event


# ---------------------------------------------------------------------------
# _relevant_frames — which images actually get shown to Claude.
# Fake keyframe files hold their own frame index as content, so we can decode
# each returned block back to a frame index without needing real JPEGs.
# ---------------------------------------------------------------------------

def _make_fake_keyframes(base_dir, video_id, count):
    kf_dir = base_dir / video_id
    kf_dir.mkdir(parents=True)
    for i in range(count):
        (kf_dir / f"{i:06d}.jpg").write_bytes(str(i).encode())
    return kf_dir


def _decode_frame_indices(blocks):
    import base64
    return sorted(int(base64.standard_b64decode(b["source"]["data"])) for b in blocks)


def test_relevant_frames_missing_dir_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(router, "KEYFRAMES_DIR", tmp_path)
    assert router._relevant_frames("no-such-video", []) == []


def test_relevant_frames_spans_full_video_not_just_the_first_n(tmp_path, monkeypatch):
    monkeypatch.setattr(router, "KEYFRAMES_DIR", tmp_path)
    _make_fake_keyframes(tmp_path, "v1", count=40)

    blocks = router._relevant_frames("v1", semantic_hits=[], max_images=16)
    indices = _decode_frame_indices(blocks)

    assert len(indices) == 16
    # Must reach all the way to the end of the video, not cluster at frame 0 —
    # this is the exact bug: sorted(glob)[:16] would only ever return 0-15.
    assert min(indices) == 0
    assert max(indices) >= 35


def test_relevant_frames_includes_semantic_hits_even_outside_the_even_spread(tmp_path, monkeypatch):
    monkeypatch.setattr(router, "KEYFRAMES_DIR", tmp_path)
    _make_fake_keyframes(tmp_path, "v1", count=40)

    # frame 7 would not be picked by a 16-of-40 even spread, but a semantic
    # hit says it's exactly what the query is about — it must show up.
    hits = [{"frame_idx": 7}]
    blocks = router._relevant_frames("v1", semantic_hits=hits, max_images=16)
    indices = _decode_frame_indices(blocks)

    assert 7 in indices


def test_relevant_frames_deduplicates_hit_and_spread_overlap(tmp_path, monkeypatch):
    monkeypatch.setattr(router, "KEYFRAMES_DIR", tmp_path)
    _make_fake_keyframes(tmp_path, "v1", count=10)

    hits = [{"frame_idx": 0}]  # also the first frame the even spread would pick
    blocks = router._relevant_frames("v1", semantic_hits=hits, max_images=16)
    indices = _decode_frame_indices(blocks)

    assert len(indices) == len(set(indices))  # no duplicate frame appears twice


# ---------------------------------------------------------------------------
# _client — BYOK: a user-supplied key must never fall back to (or get
# confused with) the server's own .env key, and a missing key on both sides
# must fail loudly rather than silently using someone else's key.
# ---------------------------------------------------------------------------

def test_client_raises_when_no_key_available_anywhere(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(router, "_anthropic", None)
    with pytest.raises(router.MissingAPIKeyError):
        router._client()


def test_client_uses_server_env_key_as_fallback(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "server-key")
    monkeypatch.setattr(router, "_anthropic", None)
    client = router._client()
    assert client.api_key == "server-key"


def test_client_prefers_user_supplied_key_over_server_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "server-key")
    monkeypatch.setattr(router, "_anthropic", None)
    client = router._client(api_key="user-byok-key")
    assert client.api_key == "user-byok-key"


def test_client_does_not_cache_user_supplied_keys_across_calls(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(router, "_anthropic", None)
    client_a = router._client(api_key="key-a")
    client_b = router._client(api_key="key-b")
    # each BYOK call must get its own client with its own key — never reuse
    # one visitor's client (and therefore key) for another visitor
    assert client_a.api_key == "key-a"
    assert client_b.api_key == "key-b"
    assert client_a is not client_b
