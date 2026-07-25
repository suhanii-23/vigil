"use client";

import { useState, useRef, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Message = { role: "user" | "assistant"; content: string; route?: string };

type Conversation = {
  id: string;
  videoId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vigil_conversations";
const API_KEY_STORAGE = "vigil_api_key";
const PROVIDER_STORAGE = "vigil_api_provider";

type Provider = "anthropic" | "openai" | "gemini" | "grok";

const PROVIDERS: { id: Provider; label: string; keyUrl: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", keyUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI (GPT)", keyUrl: "https://platform.openai.com/api-keys", placeholder: "sk-..." },
  { id: "gemini", label: "Google (Gemini)", keyUrl: "https://aistudio.google.com/apikey", placeholder: "AIza..." },
  { id: "grok", label: "xAI (Grok)", keyUrl: "https://console.x.ai", placeholder: "xai-..." },
];

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
}

function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

function saveApiKey(key: string) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

function loadProvider(): Provider {
  if (typeof window === "undefined") return "anthropic";
  const stored = localStorage.getItem(PROVIDER_STORAGE);
  return (PROVIDERS.find(p => p.id === stored)?.id) ?? "anthropic";
}

function saveProvider(provider: Provider) {
  localStorage.setItem(PROVIDER_STORAGE, provider);
}

function newConversation(videoId: string): Conversation {
  return {
    id: crypto.randomUUID(),
    videoId,
    title: "New conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

function titleFromMessage(text: string): string {
  return text.length > 48 ? text.slice(0, 48) + "…" : text;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function AlertBadge({ text }: { text: string }) {
  const isAlert = /unusual|detected|theft|suspicious|notable|alarming/i.test(text);
  if (!isAlert) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-red-700 text-red-400 bg-red-950/40 uppercase tracking-wider ml-2">
      <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse inline-block" />
      Alert
    </span>
  );
}

function RouteBadge({ route }: { route?: string }) {
  if (!route) return null;
  const colors: Record<string, string> = {
    structured: "border-blue-800 text-blue-400",
    semantic: "border-purple-800 text-purple-400",
    hybrid: "border-amber-800 text-amber-400",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${colors[route] ?? "border-zinc-700 text-zinc-500"} uppercase tracking-wider`}>
      {route}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      {!isUser && (
        <div className="flex items-center gap-2 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Vigil</span>
          <RouteBadge route={msg.route} />
          <AlertBadge text={msg.content} />
        </div>
      )}
      <div className={`max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "bg-zinc-900 text-zinc-200 border border-zinc-800"
      }`}>
        {msg.content}
      </div>
      {isUser && <span className="text-[10px] font-mono text-zinc-600 px-1">You</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API key control — BYOK: key lives only in the visitor's browser and is
// sent per-request to the backend, never persisted server-side.
// ---------------------------------------------------------------------------

function ApiKeyControl() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [saved, setSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existing = loadApiKey();
    setKey(existing);
    setProvider(loadProvider());
    setSaved(!!existing);
  }, []);

  // Close on outside click / Escape. Deliberately not a `fixed inset-0`
  // backdrop div — the header's `backdrop-blur` (a backdrop-filter) creates
  // a new containing block for `position: fixed` descendants in modern
  // browsers, so a backdrop nested inside it renders sized to the header,
  // not the viewport. A document-level listener sidesteps that entirely.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleSave() {
    saveApiKey(key.trim());
    saveProvider(provider);
    setSaved(!!key.trim());
    setOpen(false);
  }

  function handleClear() {
    saveApiKey("");
    setKey("");
    setSaved(false);
  }

  const activeProvider = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`text-xs font-mono transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          saved ? "border-emerald-800 text-emerald-400" : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
        }`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${saved ? "bg-emerald-500" : "bg-zinc-600"}`} />
        <span className="hidden sm:inline">{saved ? `${activeProvider.label.split(" ")[0]} key set` : "Add API key"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-lg p-4 z-20 shadow-xl">
          <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
            Your own API key, for any provider below. Stored only in this
            browser and sent directly with each chat request — never logged
            or stored on the server.
          </p>

          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-zinc-500 mb-3"
          >
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">API key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={activeProvider.placeholder}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-zinc-500 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 bg-white text-black text-xs font-mono py-1.5 rounded hover:bg-zinc-200 transition-colors"
            >
              Save
            </button>
            {saved && (
              <button
                onClick={handleClear}
                className="text-xs font-mono text-zinc-500 hover:text-red-400 px-3 py-1.5 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <a
            href={activeProvider.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-[10px] text-zinc-600 hover:text-zinc-400 mt-2 underline"
          >
            Get an API key from {activeProvider.label} →
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  videoId,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onClose,
}: {
  videoId: string;
  activeId: string;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [convs, setConvs] = useState<Conversation[]>([]);

  useEffect(() => {
    const refresh = () => setConvs(loadConversations().filter(c => c.videoId === videoId));
    refresh();
    window.addEventListener("vigil_convs_updated", refresh);
    return () => window.removeEventListener("vigil_convs_updated", refresh);
  }, [videoId]);

  return (
    <>
      {/* Backdrop on mobile */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full z-30 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col
        transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:translate-x-0 lg:flex
      `}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Conversations</span>
          <button
            onClick={onNew}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {convs.length === 0 && (
            <p className="text-xs font-mono text-zinc-600 px-4 py-3">No conversations yet</p>
          )}
          {[...convs].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => (
            <div
              key={c.id}
              onClick={() => onSelect(c)}
              className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                c.id === activeId ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono truncate">{c.title}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {new Date(c.updatedAt).toLocaleDateString()} · {c.messages.length / 2 | 0} exchanges
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400 p-1 ml-1 shrink-0"
                title="Delete"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Video ID chip */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[10px] font-mono text-zinc-500 truncate">{videoId.slice(0, 8)}… active</span>
          </div>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main chat UI
// ---------------------------------------------------------------------------

function ChatUI() {
  const params = useSearchParams();
  const router = useRouter();
  const videoId = params.get("video_id") ?? "";

  const [activeConv, setActiveConv] = useState<Conversation>(() => {
    const existing = loadConversations().find(
      c => c.videoId === videoId && c.messages.length === 0
    );
    return existing ?? newConversation(videoId);
  });

  const [messages, setMessages] = useState<Message[]>(activeConv.messages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConv.id]);

  // Persist conversation whenever messages change
  const persistConv = useCallback((conv: Conversation, msgs: Message[]) => {
    const updated: Conversation = {
      ...conv,
      messages: msgs,
      updatedAt: Date.now(),
      title: msgs.find(m => m.role === "user")
        ? titleFromMessage(msgs.find(m => m.role === "user")!.content)
        : conv.title,
    };
    const all = loadConversations();
    const idx = all.findIndex(c => c.id === updated.id);
    if (idx >= 0) all[idx] = updated;
    else all.push(updated);
    saveConversations(all);
    window.dispatchEvent(new Event("vigil_convs_updated"));
    return updated;
  }, []);

  async function send() {
    if (!input.trim() || loading) return;
    const query = input.trim();
    const userMsg: Message = { role: "user", content: query };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput("");
    setLoading(true);

    // Save immediately so the sidebar title updates
    const savedConv = persistConv(activeConv, nextMsgs);
    setActiveConv(savedConv);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId, query, history: messages,
          provider: loadProvider(),
          api_key: loadApiKey() || undefined,
        }),
      });

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const content = data.detail
          ?? "Add your API key (top right, \"Add API key\") to chat.";
        const errMsgs = [...nextMsgs, { role: "assistant" as const, content }];
        setMessages(errMsgs);
        persistConv(savedConv, errMsgs);
        return;
      }

      const data = await res.json();
      const assistantMsg: Message = { role: "assistant", content: data.answer, route: data.route };
      const finalMsgs = [...nextMsgs, assistantMsg];
      setMessages(finalMsgs);
      const finalConv = persistConv(savedConv, finalMsgs);
      setActiveConv(finalConv);
    } catch {
      const errMsgs = [...nextMsgs, { role: "assistant" as const, content: "Connection error — check backend." }];
      setMessages(errMsgs);
      persistConv(savedConv, errMsgs);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectConv(c: Conversation) {
    setActiveConv(c);
    setMessages(c.messages);
    setSidebarOpen(false);
  }

  function handleNewConv() {
    const c = newConversation(videoId);
    setActiveConv(c);
    setMessages([]);
    setSidebarOpen(false);
  }

  function handleDeleteConv(id: string) {
    const all = loadConversations().filter(c => c.id !== id);
    saveConversations(all);
    window.dispatchEvent(new Event("vigil_convs_updated"));
    if (id === activeConv.id) handleNewConv();
  }

  const suggestions = [
    "Is there any unusual activity?",
    "What objects were detected?",
    "Describe the overall scene",
    "Who is present throughout the video?",
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Scanline */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]" />

      {/* Sidebar */}
      <Sidebar
        videoId={videoId}
        activeId={activeConv.id}
        onSelect={handleSelectConv}
        onNew={handleNewConv}
        onDelete={handleDeleteConv}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main panel */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle (mobile) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-black tracking-widest text-white">VIGIL</span>
            </div>
            <span className="text-xs font-mono text-zinc-600 truncate max-w-[200px] hidden sm:block">
              {activeConv.title}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ApiKeyControl />
            <button
              onClick={handleNewConv}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-600"
              title="New conversation"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">New chat</span>
            </button>
            <button
              onClick={() => router.push("/")}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="hidden sm:inline">New footage</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-8 mt-12">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest px-3">Feed active</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                  <p className="text-zinc-400 text-sm">Footage processed. Ready for analysis.</p>
                  <p className="text-zinc-600 text-xs font-mono">Ask about objects, events, timestamps, or suspicious activity</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="text-xs font-mono px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 bg-zinc-900/60 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}

            {loading && (
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Vigil</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs font-mono text-zinc-500">Analysing footage…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur px-6 py-4">
          <form
            className="max-w-3xl mx-auto flex gap-3 items-center"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              ref={inputRef}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-500 transition-colors font-mono"
              placeholder="Query footage…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 text-sm font-mono hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ↵ Send
            </button>
          </form>
          <p className="text-center text-[10px] font-mono text-zinc-700 mt-2">
            Try: "what's at 0:45?" · "any suspicious behaviour?" · "describe the scene at 1:30"
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatUI />
    </Suspense>
  );
}
