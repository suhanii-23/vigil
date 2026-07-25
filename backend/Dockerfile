FROM python:3.12-slim

# libgl1/libglib2.0-0 for opencv-python-headless, libgomp1 for torch's OpenMP
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the dependency manifest first so the expensive layers below
# (torch download, model weight downloads) are cached and skipped on
# code-only changes. `COPY . .` used to come first, which busted this cache
# on every deploy regardless of what actually changed.
COPY pyproject.toml .

# pip's default `torch` wheel on Linux bundles the full CUDA/NVIDIA GPU
# toolkit (~9GB) even though this runs CPU-only inference — install the
# CPU-only build explicitly first so the deps install below sees torch
# already satisfied and never pulls the CUDA variant as a transitive dep.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Mirrors pyproject.toml's [project.dependencies] — kept separate (rather
# than `pip install .`) so this cacheable layer doesn't require the source
# tree to be present yet. Keep in sync when dependencies change.
RUN pip install --no-cache-dir \
    "fastapi>=0.111" \
    "uvicorn[standard]>=0.29" \
    "python-multipart>=0.0.9" \
    "opencv-python-headless>=4.9" \
    "ultralytics>=8.2" \
    "lap>=0.5.12" \
    "sentence-transformers>=3.0" \
    "chromadb>=0.5" \
    "anthropic>=0.28" \
    "openai>=1.30" \
    "pillow>=10.3" \
    "python-dotenv>=1.0"

# Pre-download model weights at build time so a fresh container doesn't need
# network access — or lose minutes — downloading them on first request.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('clip-ViT-B-32')"

COPY . .
RUN pip install --no-cache-dir --no-deps .

EXPOSE 8000

# Railway (and most hosts) inject PORT dynamically; fall back to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
