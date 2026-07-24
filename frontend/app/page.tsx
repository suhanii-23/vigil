"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const CharacterScene3D = dynamic(() => import("./components/CharacterScene3D"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%" }} />,
});

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPTED_FORMATS = ["MP4", "MOV", "AVI", "MKV", "WEBM"];
const MAX_SIZE_GB = 2;

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text: string, speed = 40, startDelay = 700) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    let i = 0;
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(t);
  }, [text, speed, startDelay]);
  return { displayed, done };
}

// ---------------------------------------------------------------------------
// Live clock for CCTV overlay
// ---------------------------------------------------------------------------
function useClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return time;
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-5 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center gap-3">
          <span className="text-[21px] sm:text-[26px] tracking-tight text-black" style={{ fontFamily: "var(--font-heading)" }}>
            Vigil®
          </span>
          <span className="text-[25px] sm:text-[30px] text-black select-none" style={{ letterSpacing: "-0.02em" }}>✳︎</span>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden flex flex-col gap-[5px] z-20" onClick={() => setMenuOpen(v => !v)}>
          <span className={`w-6 h-[2px] bg-black block transition-all duration-300 ${menuOpen ? "rotate-45 translate-y-[7px]" : ""}`}/>
          <span className={`w-6 h-[2px] bg-black block transition-all duration-300 ${menuOpen ? "opacity-0" : ""}`}/>
          <span className={`w-6 h-[2px] bg-black block transition-all duration-300 ${menuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`}/>
        </button>
      </nav>

      <div className={`fixed inset-0 z-9 bg-[#f0ede6]/97 flex flex-col justify-center px-8 gap-8 transition-opacity duration-300 md:hidden ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} style={{ zIndex: 9 }}>
        <a href="#how-it-works" className="text-[32px] font-medium text-black hover:opacity-50 transition-opacity"
          onClick={() => { setMenuOpen(false); document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }}>
          How it works
        </a>
        <a href="#upload-section" className="text-[32px] font-medium text-black underline underline-offset-2 hover:opacity-50 transition-opacity"
          onClick={() => { setMenuOpen(false); document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" }); }}>
          Upload footage
        </a>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero({ onUpload }: { onUpload: () => void }) {
  const [pillsVisible, setPillsVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPillsVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const { displayed, done } = useTypewriter(
    "Drop your CCTV footage and ask it anything. Who came in at 3am? What happened near the register? It has seen it all. It forgets nothing.",
    38, 900
  );

  return (
    <section className="relative h-screen flex flex-col justify-end md:justify-center pb-10 md:pb-0 px-5 sm:px-8 md:px-12 overflow-hidden">
      <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-end md:items-center gap-0">

        {/* Text — left */}
        <div className="md:flex-1 max-w-lg z-10">
          {/* Blurred intro */}
          <p className="pointer-events-none select-none mb-5 sm:mb-6 text-black font-normal"
            style={{ fontSize: "clamp(17px, 3.5vw, 24px)", lineHeight: 1.3, filter: "blur(4px)" }}>
            Hey. Meet V.I.G.I.L.<br/>
            The one who never blinks, never takes breaks, and never asks for overtime.
          </p>

          {/* Typewriter */}
          <p className="text-black mb-6 sm:mb-8 font-normal"
            style={{ fontSize: "clamp(17px, 3.5vw, 24px)", lineHeight: 1.35, minHeight: "54px" }}>
            {displayed}
            {!done && (
              <span className="inline-block w-[2px] bg-black align-middle ml-[2px]"
                style={{ height: "1.1em", animation: "blink 1s step-end infinite" }}/>
            )}
          </p>

          {/* Action pill row — one row, one reveal, matching weight */}
          <div className="flex flex-wrap items-center gap-2 mb-6"
            style={{ opacity: pillsVisible ? 1 : 0, transform: pillsVisible ? "translateY(0)" : "translateY(8px)", transition: "opacity 0.4s ease, transform 0.4s ease" }}>
            <button
              onClick={onUpload}
              className="group relative inline-flex items-center gap-3 bg-black text-white rounded-full overflow-hidden whitespace-nowrap"
              style={{ fontSize: "clamp(14px, 2vw, 17px)", padding: "0.6em 1.6em" }}>
              {/* Scan shimmer */}
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-gradient-to-r from-transparent via-white/15 to-transparent"/>
              {/* Pulse ring on hover */}
              <span className="absolute -inset-0.5 rounded-full border border-black/0 group-hover:border-black/20 group-hover:scale-110 transition-all duration-300"/>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
              Upload footage
            </button>
            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200"
              style={{ fontSize: "clamp(14px, 2vw, 17px)", padding: "0.6em 1.6em" }}>
              How it works
            </button>
          </div>
        </div>

        {/* 3D Character — right */}
        <div
          className="md:flex-1 self-end md:self-stretch"
          style={{ minHeight: 480, maxHeight: "80vh" }}
        >
          <CharacterScene3D />
        </div>
      </div>

      <style>{`
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How It Works
// ---------------------------------------------------------------------------
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Upload your footage",
      body: "Drop any surveillance video up to 2GB. Vigil ingests it and gets to work immediately in the background.",
    },
    {
      num: "02",
      title: "AI watches every frame",
      body: "YOLOv8 runs object detection at every frame. CLIP embeddings then capture the visual meaning of each keyframe: people, objects, scenes, movement.",
    },
    {
      num: "03",
      title: "Ask anything, in plain English",
      body: "\"Was anyone near the safe at midnight?\" \"What happened before the alarm went off?\" Vigil routes your question through structured metadata and semantic search, then looks at the actual frames.",
    },
    {
      num: "04",
      title: "Get a real answer",
      body: "A verdict, timestamped evidence, and visual context. Not a summary. Not a guess. Ask follow-ups — the conversation keeps its memory.",
    },
  ];

  return (
    <section id="how-it-works" className="px-5 sm:px-8 md:px-12 py-24 md:py-36 border-t border-black/8">
      <div className="max-w-6xl mx-auto">
        <p className="text-[11px] font-mono text-black/35 uppercase tracking-widest mb-14">How it works</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-14">
          {steps.map(s => (
            <div key={s.num}>
              <p className="text-[10px] font-mono text-black/25 mb-3 tracking-[0.2em]">{s.num}</p>
              <h3 className="text-[22px] sm:text-[25px] text-black mb-3 leading-tight" style={{ fontFamily: "var(--font-heading)" }}>
                {s.title}
              </h3>
              <p className="text-black/50 text-[15px] sm:text-[16px] leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upload section with CCTV camera frame
// ---------------------------------------------------------------------------
type JobStatus = "idle" | "uploading" | "processing" | "error";

function UploadSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [detail, setDetail] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const time = useClock();

  async function handleFile(file: File) {
    if (file.size > MAX_SIZE_GB * 1024 ** 3) { setStatus("error"); setDetail(`File exceeds ${MAX_SIZE_GB}GB`); return; }
    setStatus("uploading"); setDetail("");
    const form = new FormData(); form.append("file", file);
    const res = await fetch(`${API}/upload`, { method: "POST", body: form });
    if (!res.ok) { setStatus("error"); setDetail("Upload failed — check backend"); return; }
    const { video_id } = await res.json();
    setStatus("processing"); setProgress(0);
    let tick = 0;
    const iv = setInterval(async () => {
      tick++; setProgress(Math.min(90, tick * 4));
      const r = await fetch(`${API}/status/${video_id}`);
      const job = await r.json();
      if (job.status === "ready") { clearInterval(iv); setProgress(100); setTimeout(() => router.push(`/chat?video_id=${video_id}`), 400); }
      else if (job.status === "error") { clearInterval(iv); setStatus("error"); setDetail(job.detail ?? "Processing failed"); }
    }, 2000);
  }

  return (
    <section id="upload-section" className="px-5 sm:px-8 md:px-12 py-24 md:py-32 border-t border-black/8">
      <div className="max-w-lg mx-auto">
        <p className="text-[11px] font-mono text-black/35 uppercase tracking-widest mb-10">Deploy footage</p>

        {/* CCTV camera mount bracket above the box */}
        <div className="flex justify-center mb-0">
          <div className="flex flex-col items-center">
            {/* Wall mount */}
            <div className="w-10 h-2.5 bg-zinc-800 rounded-sm"/>
            {/* Arm */}
            <div className="w-1.5 h-5 bg-zinc-700"/>
            {/* Camera housing */}
            <div className="flex items-center gap-2 bg-zinc-900 rounded px-3 py-1.5 shadow-lg">
              {/* Lens */}
              <div className="w-6 h-6 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-inner">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-950 border border-zinc-600"/>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[7px] font-mono text-zinc-400 tracking-widest">VIGIL CAM-01</span>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
                  <span className="text-[6px] font-mono text-red-400">REC</span>
                </div>
              </div>
            </div>
            {/* Connector arm down to box */}
            <div className="w-px h-4 bg-zinc-400"/>
          </div>
        </div>

        {/* Upload box styled as CCTV monitor frame */}
        <div
          onClick={() => status === "idle" && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f && status === "idle") handleFile(f); }}
          className={`relative overflow-hidden transition-all duration-200 ${status === "idle" ? "cursor-pointer" : "cursor-default"} ${
            dragging ? "ring-2 ring-black" : status === "error" ? "ring-1 ring-red-400" : ""
          }`}
          style={{ border: "2px solid #1a1a1a", borderRadius: "4px", background: dragging ? "#f5f3ee" : "#faf9f6" }}
        >
          {/* CCTV HUD bar — top */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-black/8 bg-zinc-900">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
              <span className="text-[9px] font-mono text-zinc-300 tracking-widest">LIVE</span>
              <span className="text-[9px] font-mono text-zinc-600 ml-1">CAM-01</span>
            </div>
            <span className="text-[9px] font-mono text-zinc-500 tabular-nums">{time}</span>
          </div>

          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none z-10"
            style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.015) 3px, rgba(0,0,0,0.015) 4px)" }}/>

          {/* Corner brackets (inner) */}
          {[
            "top-9 left-0 border-t-2 border-l-2",
            "top-9 right-0 border-t-2 border-r-2",
            "bottom-8 left-0 border-b-2 border-l-2",
            "bottom-8 right-0 border-b-2 border-r-2",
          ].map((cls, i) => (
            <div key={i} className={`absolute w-5 h-5 ${cls} border-black/30 transition-colors ${dragging ? "border-black/60" : ""}`}/>
          ))}

          <input ref={inputRef} type="file" accept="video/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>

          <div className="px-14 py-12 flex flex-col items-center gap-4">
            {/* Camera icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${
              status === "error" ? "border-red-400" : dragging ? "border-black scale-110" : "border-black/20"}`}>
              {status === "idle" || status === "error" ? (
                <svg className={`w-5 h-5 ${status === "error" ? "text-red-400" : "text-black/40"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              ) : <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"/>}
            </div>

            {status === "idle" && (
              <div className="text-center space-y-1">
                <p className="text-black text-sm">Drop footage here or click to browse</p>
                <p className="text-black/30 text-xs font-mono">Drag and drop supported</p>
              </div>
            )}
            {status === "uploading" && <p className="text-black text-sm font-mono">Uploading footage...</p>}
            {status === "processing" && (
              <div className="text-center space-y-1">
                <p className="text-black text-sm font-mono">Vigil is watching...</p>
                <p className="text-black/35 text-xs font-mono">Running detection and embeddings</p>
              </div>
            )}
            {status === "error" && (
              <div className="text-center space-y-2">
                <p className="text-red-500 text-sm font-mono">{detail || "Upload failed"}</p>
                <button onClick={() => setStatus("idle")} className="text-black/40 text-xs underline underline-offset-2 hover:text-black">Try again</button>
              </div>
            )}

            {(status === "uploading" || status === "processing") && (
              <div className="w-full space-y-1">
                <div className="h-px bg-black/10 overflow-hidden">
                  <div className="h-full bg-black transition-all duration-700" style={{ width: `${status === "uploading" ? 12 : progress}%` }}/>
                </div>
                <p className="text-[10px] font-mono text-black/25 text-right">{status === "uploading" ? "" : `${Math.round(progress)}%`}</p>
              </div>
            )}
          </div>

          {/* CCTV HUD bar — bottom */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-black/8 bg-zinc-900">
            <span className="text-[8px] font-mono text-zinc-600 tracking-widest">VIGIL INTELLIGENCE SYSTEM</span>
            <span className="text-[8px] font-mono text-zinc-600">MOTION DETECT ON</span>
          </div>
        </div>

        {/* Format badges */}
        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-black/30 uppercase tracking-widest">Formats</span>
            {ACCEPTED_FORMATS.map(f => (
              <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 border border-black/10 text-black/35 rounded hover:border-black/20 hover:text-black/55 transition-colors cursor-default">{f}</span>
            ))}
          </div>
          <span className="text-[10px] font-mono text-black/30">Max <span className="text-black/45">{MAX_SIZE_GB}GB</span></span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function Footer() {
  return (
    <footer className="px-5 sm:px-8 md:px-12 py-10 border-t border-black/8 flex justify-between items-center">
      <span className="text-[12px] text-black/25 font-mono">Vigil® · AI Video Intelligence</span>
      <span className="text-[12px] text-black/25 font-mono">v0.1</span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function Home() {
  const scrollToUpload = useCallback(() => {
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <main className="bg-[#f0ede6] text-black min-h-screen">
      <Navbar/>
      <Hero onUpload={scrollToUpload}/>
      <HowItWorks/>
      <UploadSection/>
      <Footer/>
    </main>
  );
}
