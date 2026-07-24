FROM python:3.12-slim

# libgl1/libglib2.0-0 for opencv-python-headless, libgomp1 for torch's OpenMP
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# pip's default `torch` wheel on Linux bundles the full CUDA/NVIDIA GPU
# toolkit (~9GB) even though this runs CPU-only inference — install the
# CPU-only build explicitly first so the later `pip install .` sees torch
# already satisfied and never pulls the CUDA variant as a transitive dep.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir .

# Pre-download model weights at build time so a fresh container doesn't need
# network access — or lose minutes — downloading them on first request.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8s.pt')"
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('clip-ViT-B-32')"

EXPOSE 8000

# Railway (and most hosts) inject PORT dynamically; fall back to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
