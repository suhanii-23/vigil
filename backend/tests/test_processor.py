import pytest

import processor


# ---------------------------------------------------------------------------
# _cosine_sim — pure math, no models involved
# ---------------------------------------------------------------------------

def test_cosine_sim_identical_vectors():
    v = [1.0, 2.0, 3.0]
    assert processor._cosine_sim(v, v) == pytest.approx(1.0)


def test_cosine_sim_orthogonal_vectors():
    assert processor._cosine_sim([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_sim_zero_vector_is_safe():
    # denom would be 0 — must not raise a ZeroDivisionError
    assert processor._cosine_sim([0.0, 0.0], [1.0, 1.0]) == 0.0


# ---------------------------------------------------------------------------
# _is_keyframe — the scene-change heuristic that decides what gets embedded
# ---------------------------------------------------------------------------

def test_is_keyframe_first_frame_is_always_a_keyframe():
    assert processor._is_keyframe([1.0, 0.0], None) is True


def test_is_keyframe_near_identical_embedding_is_not_a_keyframe():
    # KEYFRAME_SCORE_THRESHOLD = 0.08, so anything with cosine distance
    # below that (i.e. barely changed from the last keyframe) is skipped.
    last = [1.0, 0.0]
    almost_same = [0.99, 0.01]
    assert processor._is_keyframe(almost_same, last) is False


def test_is_keyframe_very_different_embedding_is_a_keyframe():
    assert processor._is_keyframe([0.0, 1.0], [1.0, 0.0]) is True


# ---------------------------------------------------------------------------
# _reset_tracker — must wipe stale tracker state between videos, since the
# YOLO model instance is a singleton reused across every upload.
# ---------------------------------------------------------------------------

def test_reset_tracker_clears_predictor():
    class FakeModel:
        predictor = "stale-tracker-state-from-a-previous-video"

    model = FakeModel()
    processor._reset_tracker(model)
    assert model.predictor is None


# ---------------------------------------------------------------------------
# _make_detection / _make_frame_record — record shape
# ---------------------------------------------------------------------------

def test_make_detection_includes_track_id():
    det = processor._make_detection("person", 0.876543, [1.0, 2.0, 3.0, 4.0], 7)
    assert det == {
        "class": "person",
        "confidence": 0.8765,  # rounded to 4 places
        "bbox": [1.0, 2.0, 3.0, 4.0],
        "track_id": 7,
    }


def test_make_detection_allows_no_track_id():
    det = processor._make_detection("car", 0.5, [0, 0, 1, 1], None)
    assert det["track_id"] is None
