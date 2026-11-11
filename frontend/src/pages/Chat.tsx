import { BackButton } from "../components/ui/BackButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { env } from "../config/env";
import { chatJSON, getChatDetail, type FlashCard, revisionAPI, revisionPolicy, type RevisionProfile, type ChatMessage, podcastStart } from "../lib/api";
import MarkdownView from "../components/Chat/MarkdownView";
import { withOccurrenceKeys } from "../lib/occurrenceKeys";
import ActionRow from "../components/Chat/ActionRow";
import FlashCards from "../components/Chat/FlashCards";
import SelectionPopup from "../components/Chat/SelectionPopup";
import Composer from "../components/Chat/Composer";
import LoadingIndicator from "../components/Chat/LoadingIndicator";
import { useCompanion } from "../components/Companion/CompanionProvider";

function extractFirstJsonObject(s: string): string {
  let depth = 0, start = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) return s.slice(start, i + 1); }
  }
  return "";
}

function normalizePayload(payload: unknown): { md: string; flashcards: FlashCard[]; topic?: string } {
  if (typeof payload === "string") {
    const s = payload.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try { const obj = JSON.parse(s); return { md: String(obj?.answer || ""), flashcards: Array.isArray(obj?.flashcards) ? obj.flashcards : [], topic: typeof obj?.topic === "string" ? obj.topic : undefined }; } catch { }
    }
    const inner = extractFirstJsonObject(s);
    if (inner) {
      try { const obj = JSON.parse(inner); return { md: String(obj?.answer || ""), flashcards: Array.isArray(obj?.flashcards) ? obj.flashcards : [], topic: typeof obj?.topic === "string" ? obj.topic : undefined }; } catch { }
    }
    return { md: s, flashcards: [] };
  }
  if (payload && typeof payload === "object") {
    const o = payload as any;
    return { md: String(o?.answer || o?.html || ""), flashcards: Array.isArray(o?.flashcards) ? o.flashcards : [], topic: typeof o?.topic === "string" ? o.topic : undefined };
  }
  return { md: "", flashcards: [] };
}

function deriveTopicFromMarkdown(md: string): string {
  const m = md.match(/^\s*#{1,6}\s+(.+?)\s*$/m);
  return m ? m[1].trim() : "";
}

export default function Chat() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const state = (location?.state || {}) as {
    chatId?: string;
    q?: string;
    answer?: string | { html?: string; answer?: string; flashcards?: FlashCard[]; topic?: string };
    flashcards?: FlashCard[];
    revisionSubject?: string;
    revisionTitle?: string;
  };

  const initialChatId = search.get("chatId") || state.chatId || "";
  const initialQuestion = search.get("q") || state.q || "";

  const [chatId, setChatId] = useState(initialChatId);
  const [messages, setMessages] = useState<ChatMessage[] | undefined>([]);
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [profile, setProfile] = useState<RevisionProfile | null>(null);
  const [subject, setSubject] = useState(state.revisionSubject ?? "");
  const [noteTitle, setNoteTitle] = useState(state.revisionTitle ?? "");
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ text: string; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState<boolean>(!!(initialChatId || initialQuestion));
  const [awaitingAnswer, setAwaitingAnswer] = useState<boolean>(false);
  const [topic, setTopic] = useState<string>("");
  const [showTopics, setShowTopics] = useState(true);
  const { setDocument } = useCompanion();

  const selPopupRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    revisionAPI.profile().then(value => {
      if (!active) return;
      setProfile(value);
      setSubject(current => current || value?.subjects[0] || "");
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Impossible de charger le profil."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!initialChatId && !initialQuestion) navigate("/tutor", { replace: true });
  }, [initialChatId, initialQuestion, navigate]);

  useEffect(() => {
    const cid = search.get("chatId") || state.chatId || "";
    setChatId(cid);
    if (state.answer) {
      const init = normalizePayload(state.answer);
      const seed: ChatMessage[] = [];
      if (initialQuestion) seed.push({ role: "user", content: initialQuestion, at: Date.now() });
      if (init.md) seed.push({ role: "assistant", content: init.md, at: Date.now() });
      if (seed.length) setMessages(seed);
      if ((init.flashcards?.length || state.flashcards?.length)) setCards(init.flashcards?.length ? init.flashcards : (state.flashcards || []));
      if (init.topic) setTopic(init.topic || "");
      else if (init.md) setTopic(deriveTopicFromMarkdown(init.md));
    } else {
      if (initialQuestion) {
        setMessages((prev) => (Array.isArray(prev) && prev.length ? prev : [{ role: "user", content: initialQuestion, at: Date.now() }]));
        setAwaitingAnswer(true);
      }
    }
  }, [search, state.chatId, state.answer, state.flashcards, initialQuestion]);

  useEffect(() => {
    if (!chatId) return;
    getChatDetail(chatId)
      .then((res) => {
        if (res?.ok && Array.isArray(res.messages)) {
          const normalized = res.messages.map((m) =>
            m.role === "assistant" ? { ...m, content: normalizePayload((m as any).content).md } : m
          );
          setMessages(normalized);
          for (let i = normalized.length - 1; i >= 0; i--) {
            const raw = (res.messages[i] as any)?.content;
            if (normalized[i].role === "assistant") {
              const n = normalizePayload(raw);
              if (n.flashcards.length) setCards(n.flashcards);
              if (n.topic) setTopic(n.topic);
              else if (n.md) setTopic(deriveTopicFromMarkdown(n.md));
              break;
            }
          }
        }
      })
      .catch(() => { });
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    const wsUrl = `${(env.backend || window.location.origin).replace(/^http/, "ws")}/ws/chat?chatId=${encodeURIComponent(chatId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setConnecting(false);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m?.type === "answer") {
          const norm = normalizePayload(m.answer);
          setMessages((prev) => ([...(Array.isArray(prev) ? prev : []), { role: "assistant", content: norm.md, at: Date.now() }]));
          if (norm.flashcards.length) setCards(norm.flashcards);
          if (norm.topic) setTopic(norm.topic);
          else if (norm.md) setTopic((t) => t || deriveTopicFromMarkdown(norm.md));
          setAwaitingAnswer(false);
          setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
        }
      } catch { }
    };
    return () => { try { ws.close(); } catch { } wsRef.current = null; };
  }, [chatId]);

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelected(null); return; }
      const r = sel.getRangeAt(0);
      const rect = r.getBoundingClientRect();
      if (!rect || !r.toString().trim()) return;
      setSelected({ text: r.toString().trim(), x: rect.left + rect.width / 2 - 60 + window.scrollX, y: rect.bottom + window.scrollY });
    };
    const onDocClick = (e: any) => {
      const n = e.target as Node;
      if (selPopupRef.current && !selPopupRef.current.contains(n) && !window.getSelection()?.toString().trim()) setSelected(null);
    };
    document.addEventListener("mouseup", onSel);
    document.addEventListener("keyup", onSel);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("mouseup", onSel);
      document.removeEventListener("keyup", onSel);
      document.removeEventListener("click", onDocClick);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Défiler après l'ajout ou le retrait d'un message.
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
  }, [Array.isArray(messages) ? messages.length : 0]);

  const saveNote = async (kind: "flashcard" | "note", title: string, content: string) => {
    const chapterTitle = (noteTitle || topic || "Notes du Tuteur").trim().slice(0, revisionPolicy.maxTitleChars);
    const key = `${subject}:${chapterTitle}:${title}:${content}`;
    if (seenRef.current.has(key)) { setSaveMessage("Cette carte est déjà enregistrée."); return; }
    seenRef.current.add(key);
    setSaveMessage("");
    setError("");
    try {
      await revisionAPI.saveTutorNote({ subject, title: chapterTitle, question: title, answer: content });
      setSaveMessage(`${kind === "note" ? "Note enregistrée" : "Carte enregistrée"} dans Cours. Elle rejoindra tes révisions.`);
    } catch (cause) {
      seenRef.current.delete(key);
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer cette carte. Réessaie.");
    }
  };

  const sendFollowup = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setMessages((prev) => ([...(Array.isArray(prev) ? prev : []), { role: "user", content: text, at: Date.now() }]));
    setAwaitingAnswer(true);
    setBusy(true);
    try {
      setError("");
      const r = await chatJSON({ q: text, chatId: chatId || undefined });
      if (r?.chatId && r.chatId !== chatId) setChatId(r.chatId);
    } catch (cause) {
      setAwaitingAnswer(false);
      setError(cause instanceof Error ? cause.message : "Impossible de joindre le Tuteur. Réessaie.");
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
    }
  };

  const latestAssistantContent = useMemo(() => {
    const arr = Array.isArray(messages) ? messages : [];
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].role === "assistant") return arr[i].content;
    }
    return "";
  }, [messages]);

  useEffect(() => {
    if (latestAssistantContent) {
      const docTitle = topic || deriveTopicFromMarkdown(latestAssistantContent) || "Sujet étudié";
      const docId = chatId ? `chat:${chatId}` : "chat:current";
      setDocument({
        id: docId,
        title: docTitle,
        text: latestAssistantContent,
      });
    } else {
      setDocument(null);
    }
  }, [chatId, latestAssistantContent, setDocument, topic]);

  useEffect(() => {
    return () => setDocument(null);
  }, [setDocument]);

  const list = Array.isArray(messages) ? messages : [];

  return (
    <div className="bg-background text-foreground flex flex-col min-h-dvh w-full px-4 md:pl-28 lg:pr-4">
      <div className="mx-auto mt-6 w-full max-w-4xl space-y-3">
        <div className="flex items-center justify-between gap-4 whitespace-nowrap text-sm">
          <BackButton fallback="/tutor" />
          <Link to="/revision" className="underline">Reprendre ma session</Link>
        </div>
        {profile ? <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm">Enregistrer les cartes dans mes révisions</summary><fieldset className="mt-3 flex flex-wrap gap-3">
          <label className="min-w-40 flex-1">Matière<select className="mt-1 w-full rounded-lg bg-surface p-2" value={subject} onChange={event => setSubject(event.target.value)}>{profile.subjects.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className="min-w-40 flex-1">Chapitre<input className="mt-1 w-full rounded-lg bg-surface p-2" maxLength={revisionPolicy.maxTitleChars} value={noteTitle} placeholder={(topic || 'Notes du Tuteur').slice(0, revisionPolicy.maxTitleChars)} onChange={event => setNoteTitle(event.target.value)} /></label>
        </fieldset></details> : <Link to="/" className="block underline">Créer mon profil pour enregistrer des cartes</Link>}
        {saveMessage && <p role="status" className="text-foreground">{saveMessage} <Link to="/courses" className="underline">Voir mes cours</Link></p>}
        {error && <p role="alert" className="text-foreground">{error}</p>}
      </div>
      {!showTopics && (
        <button type="button"
          onClick={() => setShowTopics(true)}
          className="fixed top-[calc(1.25rem+env(safe-area-inset-top))] right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border text-muted hover:text-foreground hover:bg-surface text-xs font-medium shadow-lg backdrop-blur transition-opacity"
          title="Afficher les cartes"
          aria-label="Afficher les cartes"
        >
          <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M15 3v18" />
          </svg>
          <span className="max-md:sr-only">Cartes ({cards.length})</span><span aria-hidden="true" className="md:hidden">{cards.length}</span>
        </button>
      )}

      <div
        className={`grid grid-cols-1 ${
          showTopics ? "xl:grid-cols-[1fr_320px] lg:grid-cols-[1fr_280px]" : ""
        } gap-6 mt-6 mb-36`}
      >
        <div className="flex-1 min-w-0 pr-0 lg:pr-2">
          <div className="w-full max-w-4xl mx-auto p-2 sm:p-4 pt-2 pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-28">
            <div className="space-y-6">
              {withOccurrenceKeys(list, message => JSON.stringify([message.role, message.at])).map(({ value: m, key }) => {
                const userBubble = "inline-block max-w-[85%] bg-surface border border-border rounded-2xl px-4 py-3";
                if (m.role === "assistant") {
                  return (
                    <div key={key} className="w-full flex justify-start">
                      <div className="w-full mx-auto rounded-3xl bg-surface border border-border ring-1 ring-border backdrop-blur px-5 sm:px-8 py-5 sm:py-8 max-w-full">
                        <div className="animate-[fadeIn_300ms_ease-out] leading-7 md:leading-8 overflow-x-auto">
                          <MarkdownView md={m.content} />
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={key} className="w-full flex justify-start">
                    <div className={userBubble}>
                      <div className="text-foreground whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                );
              })}
              {(connecting || awaitingAnswer) && (
                <div className="w-full flex justify-start">
                  <LoadingIndicator label={connecting ? "Connexion…" : "Réflexion…"} />
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {latestAssistantContent && !awaitingAnswer && (
              <ActionRow
                disabled={busy}
                onSummarize={() => sendFollowup("Résume la réponse précédente en français en 5 à 7 points avec les mots-clés en gras.")}
                onLearnMore={() => sendFollowup("Approfondis ce sujet en français avec des exemples concrets et une courte analogie.")}
                onStartQuiz={() => {
                  const t = topic || deriveTopicFromMarkdown(latestAssistantContent) || "Général";
                  navigate(`/quiz?topic=${encodeURIComponent(t)}`, { state: { topic: t } });
                }}
                onCreatePodcast={async () => {
                  try {
                    setError("");
                    const topicContent = latestAssistantContent || topic || "Créé depuis le Tuteur";
                    const response = await podcastStart({ topic: topicContent });
                    navigate("/tools", { state: { podcastPid: response.pid, podcastTopic: topicContent } });
                  } catch {
                    setError("Impossible de créer le podcast. Réessaie.");
                  }
                }}
              />
            )}
          </div>
        </div>

        {showTopics && (
          <FlashCards
            items={cards}
            onAdd={({ kind, title, content }) => void saveNote(kind, title, content)}
            disabled={!profile}
            onToggleCollapse={() => setShowTopics(false)}
          />
        )}
      </div>

      <SelectionPopup
        selected={selected}
        popupRef={selPopupRef}
        addNote={(text) => { void saveNote("note", `Note : ${text.slice(0, 30)}${text.length > 30 ? "..." : ""}`, text); setSelected(null); }}
        askDoubt={(text) => { const v = text.trim(); if (v) sendFollowup(v); setSelected(null); }}
      />

      <Composer disabled={busy} onSend={sendFollowup} />
    </div>
  );
}
