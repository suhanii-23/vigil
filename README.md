# Vigil

Open-source video intelligence — upload a video, chat with it via RAG.

## Stack
- **Frontend**: Next.js 14 + Tailwind (Vercel)
- **Backend**: FastAPI + Python 3.10+
- **Detection**: YOLOv8 (ultralytics)
- **Embeddings**: CLIP (sentence-transformers)
- **Vector DB**: ChromaDB (local, persistent)
- **LLM**: Claude (claude-sonnet-4-6)

## Quick start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Architecture

```
Upload → processor.py
  ├── OpenCV frame extraction (1 fps)
  ├── YOLOv8 detection per frame
  └── CLIP embedding for keyframes
        ↓
storage.py
  ├── JSONL  → backend/data/metadata/<video_id>.jsonl
  └── ChromaDB → backend/data/chroma/

Chat → router.py (next step)
  ├── Structured path  → query JSONL (counts, classes, timestamps)
  ├── Semantic path    → query ChromaDB (scene / vibe)
  └── Claude synthesises answer
```
