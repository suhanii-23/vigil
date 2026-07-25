import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
METADATA_DIR = DATA_DIR / "metadata"
CHROMA_DIR = DATA_DIR / "chroma"
KEYFRAMES_DIR = DATA_DIR / "keyframes"
JOBS_FILE = DATA_DIR / "jobs.json"

for d in (VIDEOS_DIR, METADATA_DIR, CHROMA_DIR, KEYFRAMES_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Frame extraction
FRAME_SAMPLE_FPS = 2              # extract 2 frames per second
KEYFRAME_SCORE_THRESHOLD = 0.08   # lower = more keyframes on static cameras

# YOLO
# Benchmarked n/s/m on real footage: confidence rises steadily with size
# (0.53/0.60/0.64) but each misses/hallucinates different classes — no size
# is a strict upgrade. "s" is the balance point: meaningfully more confident
# than nano at ~2x latency, well short of medium's ~3.5x.
YOLO_MODEL = "yolov8s.pt"
YOLO_CONF_THRESHOLD = 0.35
YOLO_TRACKER = "bytetrack.yaml"  # motion-only MOT tracker, ships with ultralytics

# CLIP / embeddings
CLIP_MODEL = "clip-ViT-B-32"  # sentence-transformers CLIP variant
EMBEDDING_DIM = 512

# ChromaDB
CHROMA_COLLECTION = "vigil_frames"

# Claude
CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_MAX_TOKENS = 1024

# BYOK providers — anthropic uses its own native SDK (its Messages API isn't
# OpenAI-compatible); openai/gemini/grok all speak the OpenAI chat-completions
# schema, so a single `openai` SDK client covers all three by just swapping
# base_url. Model names are defaults and will need updating as providers ship
# newer ones — not something to hardcode and forget.
PROVIDER_CONFIGS = {
    "anthropic": {"model": CLAUDE_MODEL, "base_url": None},
    "openai": {"model": "gpt-5.6", "base_url": "https://api.openai.com/v1"},
    "gemini": {
        "model": "gemini-3.6-flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    },
    "grok": {"model": "grok-4.5", "base_url": "https://api.x.ai/v1"},
}

# API
# Comma-separated in production (e.g. "https://vigil.vercel.app"); always
# includes localhost:3000 so local dev keeps working regardless.
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
CORS_ORIGINS = ["http://localhost:3000", *_extra_origins]
