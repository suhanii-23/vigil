import storage


def test_read_metadata_missing_video_returns_empty_list(tmp_storage):
    assert storage.read_metadata("no-such-video") == []


def test_save_and_read_metadata_roundtrip(tmp_storage):
    records = [
        {
            "video_id": "v1",
            "frame_idx": 0,
            "timestamp_sec": 0.0,
            "detections": [
                {"class": "person", "confidence": 0.9, "bbox": [0, 0, 1, 1], "track_id": 1}
            ],
            "is_keyframe": True,
            "embedding": [0.1, 0.2, 0.3],
        },
        {
            "video_id": "v1",
            "frame_idx": 1,
            "timestamp_sec": 0.5,
            "detections": [],
            "is_keyframe": False,
            "embedding": None,
        },
    ]

    storage.save_frame_records("v1", records)
    read_back = storage.read_metadata("v1")

    assert len(read_back) == 2
    # embeddings are stripped from JSONL to keep file sizes sane — only a
    # flag (is_keyframe) is kept, the vector itself lives in ChromaDB
    assert "embedding" not in read_back[0]
    assert read_back[0]["detections"][0]["track_id"] == 1


def test_query_embeddings_returns_nearest_match(tmp_storage):
    records = [
        {
            "video_id": "v1", "frame_idx": 0, "timestamp_sec": 0.0,
            "detections": [{"class": "cat"}], "is_keyframe": True, "embedding": [1.0, 0.0],
        },
        {
            "video_id": "v1", "frame_idx": 5, "timestamp_sec": 2.5,
            "detections": [{"class": "dog"}], "is_keyframe": True, "embedding": [0.0, 1.0],
        },
    ]
    storage.save_frame_records("v1", records)

    hits = storage.query_embeddings([0.9, 0.1], "v1", n_results=1)

    assert len(hits) == 1
    assert hits[0]["frame_idx"] == 0  # nearer to the "cat" frame's embedding


def test_query_embeddings_filters_by_video_id(tmp_storage):
    records_v1 = [{
        "video_id": "v1", "frame_idx": 0, "timestamp_sec": 0.0,
        "detections": [], "is_keyframe": True, "embedding": [1.0, 0.0],
    }]
    records_v2 = [{
        "video_id": "v2", "frame_idx": 0, "timestamp_sec": 0.0,
        "detections": [], "is_keyframe": True, "embedding": [1.0, 0.0],
    }]
    storage.save_frame_records("v1", records_v1)
    storage.save_frame_records("v2", records_v2)

    hits = storage.query_embeddings([1.0, 0.0], "v1", n_results=5)

    assert all(h["video_id"] == "v1" for h in hits)


def test_delete_video_data_removes_metadata_and_embeddings(tmp_storage):
    records = [{
        "video_id": "v1", "frame_idx": 0, "timestamp_sec": 0.0,
        "detections": [], "is_keyframe": True, "embedding": [1.0, 0.0],
    }]
    storage.save_frame_records("v1", records)

    storage.delete_video_data("v1")

    assert storage.read_metadata("v1") == []
    assert storage.query_embeddings([1.0, 0.0], "v1") == []
