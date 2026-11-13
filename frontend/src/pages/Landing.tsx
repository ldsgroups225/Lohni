import { usePersistentDetails } from '../lib/usePersistentDetails'
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AdaptiveErrorBoundary, adaptiveToast } from '@cognicatch/react'
import { Link, useNavigate } from "react-router-dom";
import { cachedDevice, currentRevisionCacheVersion } from '../lib/cachedDevice'
import PromptBox from "../components/Landing/PromptBox";
import { chatMultipart, chatJSON, getChats, revisionAPI, type RevisionChapter, type RevisionProfile, type ChatInfo } from "../lib/api";

// Keyboard support shared by both dropdowns: arrows/Home/End move between items, Escape closes and refocuses the trigger, Tab closes.
function menuKeys(e: React.KeyboardEvent<HTMLElement>, open: boolean, setOpen: (v: boolean) => void) {
  const trigger = e.currentTarget.querySelector<HTMLElement>("[aria-haspopup]");
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]"));
  const i = items.indexOf(document.activeElement as HTMLElement);
  const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
  if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); trigger?.focus(); }
  else if (e.key === "Tab") setOpen(false);
  else if (!open && e.key === "ArrowDown" && document.activeElement === trigger) {
    e.preventDefault(); setOpen(true);
    const root = e.currentTarget;
    setTimeout(() => root.querySelector<HTMLElement>("[role=menuitemradio]")?.focus(), 0);
  }
  else if (open && e.key === "ArrowDown") go(i + 1);
  else if (open && e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
  else if (open && e.key === "Home") go(0);
  else if (open && e.key === "End") go(-1);
}

let cachedChats: ChatInfo[] = [];

export default function Landing() {
  const [chats, setChats] = useState<ChatInfo[]>(cachedChats);
  const chatsDetails = usePersistentDetails("lohni-tutor-chats");
  useEffect(() => {
    let active = true;
    getChats().then(result => { if (active) { cachedChats = result.chats; setChats(result.chats); } }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [chapters, setChapters] = useState<RevisionChapter[] | null>(null);
  const [chaptersError, setChaptersError] = useState(false);
  const [profile, setProfile] = useState<RevisionProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadCourses() {
      const device = cachedDevice(), version = currentRevisionCacheVersion();
      try {
        const value = await revisionAPI.chapters();
        if (!active) return;
        if (device !== cachedDevice() || version !== currentRevisionCacheVersion()) { setChapters(null); void loadCourses(); return; }
        setChapters(value);
      } catch {
        if (!active) return;
        if (device !== cachedDevice() || version !== currentRevisionCacheVersion()) { setChapters(null); void loadCourses(); return; }
        setChaptersError(true);
      }
    }
    async function loadProfile() {
      const device = cachedDevice(), version = currentRevisionCacheVersion();
      try {
        const value = await revisionAPI.profile();
        if (!active) return;
        if (device !== cachedDevice() || version !== currentRevisionCacheVersion()) { setProfile(null); void loadProfile(); return; }
        setProfile(value); setProfileLoaded(true);
      } catch {
        if (!active) return;
        if (device !== cachedDevice() || version !== currentRevisionCacheVersion()) { setProfile(null); void loadProfile(); return; }
        setProfileError(true);
      }
    }
    void loadCourses(); void loadProfile();
    return () => { active = false; };
  }, []);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"Discussion" | "Quiz">("Discussion");
  const [responseLength, setResponseLength] = useState<"Courte" | "Moyenne" | "Longue">("Moyenne");
  const [showMode, setShowMode] = useState(false);
  const [showLength, setShowLength] = useState(false);

  // Close the dropdowns on Escape or when tapping outside them.
  useEffect(() => {
    if (!showMode && !showLength) return;
    const close = () => { setShowMode(false); setShowLength(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: Event) => { if (!(e.target as Element).closest("[data-dropdown]")) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [showMode, showLength]);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const onPickFile = () => fileRef.current?.click();
  const onRemoveFile = () => setStagedFile(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setStagedFile(f);
  };
  const onDropZoneDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    setStagedFile(f);
  };

  const onSend = async (override?: string) => {
    if (busy) return;
    const q = (override ?? prompt).trim();
    if (!q && !stagedFile) return;

    if (mode === "Quiz" && override === undefined) {
      navigate(`/quiz?topic=${encodeURIComponent(q)}`, { state: { topic: q } });
      return;
    }

    const question = `${q}\n\nRéponds de façon ${responseLength.toLowerCase()}.`;
    setBusy(true);
    try {
      if (stagedFile) {
        const { chatId } = await chatMultipart(question, [stagedFile]);
        navigate(`/chat?chatId=${encodeURIComponent(chatId)}&q=${encodeURIComponent(q)}`);
        return;
      }
      const r = await chatJSON({ q: question });
      navigate(`/chat?chatId=${encodeURIComponent(r.chatId)}&q=${encodeURIComponent(q)}`);
    } catch {
      adaptiveToast.error("Impossible de démarrer la discussion", "Impossible de joindre le Tuteur. Réessaie d’envoyer ta question.");
    } finally {
      setBusy(false);
    }
  };

  const fragileChapter = chapters?.find(chapter => chapter.status === 'Fragile');
  const subjects = profile?.subjects ?? [];
  return <main className="min-h-dvh bg-background px-4 pt-6 pb-28 text-foreground md:pl-28">
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">Que veux-tu comprendre ?</h1>
      <AdaptiveErrorBoundary mode="manual" severity="medium" title="La saisie est indisponible" description="Impossible de charger la zone de saisie. Actualise la page pour continuer." theme={{ backgroundColor: 'var(--color-surface)', textColor: 'var(--color-foreground)', primaryColor: 'var(--color-primary)', fontFamily: "'Schibsted Grotesk', sans-serif", borderRadius: '24px' }}>
        <PromptBox value={prompt} onChange={setPrompt} onSend={() => void onSend()} onPickFile={onPickFile} onRemoveFile={onRemoveFile} stagedFileName={stagedFile?.name ?? null} busy={busy} onDragOver={onDropZoneDragOver} onDrop={onDropZoneDrop}>
          <fieldset data-dropdown onKeyDown={event => menuKeys(event, showMode, setShowMode)} className="relative min-w-0 flex-1">
            <button type="button" aria-label={`Mode : ${mode}`} aria-haspopup="menu" aria-expanded={showMode} aria-controls="menu-mode" onClick={() => setShowMode(!showMode)} className="min-h-11 w-full rounded-xl border border-border bg-background px-1 text-sm font-semibold leading-tight">{mode}</button>
            {showMode && <div id="menu-mode" role="menu" className="absolute top-full left-0 z-20 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg">{(['Discussion', 'Quiz'] as const).map(opt => <button key={opt} type="button" role="menuitemradio" aria-checked={opt === mode} className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-tint" onClick={event => { setMode(opt); setShowMode(false); event.currentTarget.closest<HTMLElement>('[data-dropdown]')?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); }}>{opt}</button>)}</div>}
          </fieldset>
          <fieldset data-dropdown onKeyDown={event => menuKeys(event, showLength, setShowLength)} className="relative min-w-0 flex-1">
            <button type="button" aria-label={`Longueur de réponse : ${responseLength}`} aria-haspopup="menu" aria-expanded={showLength} aria-controls="menu-length" onClick={() => setShowLength(!showLength)} className="min-h-11 w-full rounded-xl border border-border bg-background px-1 text-sm font-semibold leading-tight">Réponse {responseLength.toLowerCase()}</button>
            {showLength && <div id="menu-length" role="menu" className="absolute top-full right-0 z-20 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg">{(['Courte', 'Moyenne', 'Longue'] as const).map(opt => <button key={opt} type="button" role="menuitemradio" aria-checked={opt === responseLength} className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-tint" onClick={event => { setResponseLength(opt); setShowLength(false); event.currentTarget.closest<HTMLElement>('[data-dropdown]')?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); }}>{opt}</button>)}</div>}
          </fieldset>
        </PromptBox>
      </AdaptiveErrorBoundary>
      <section className="space-y-2"><h2 className="text-sm font-bold text-muted">Depuis tes cours</h2>
        {chaptersError ? <p className="text-sm text-muted" role="status">Tes cours sont temporairement indisponibles.</p> : chapters === null ? <p className="text-sm text-muted" role="status">Chargement de tes cours…</p> : chapters.length === 0 ? <p className="text-sm text-muted">Ajoute un chapitre pour obtenir des suggestions.</p> : chapters.slice(0, 2).map((chapter, index) => {
          const question = index === 0 ? `Explique-moi ${chapter.title} en ${chapter.subject}` : `Donne-moi un exercice sur ${chapter.title} en ${chapter.subject}`;
          return <button key={chapter.id} type="button" disabled={busy} onClick={() => void onSend(question)} className="block min-h-16 w-full rounded-2xl border border-border bg-surface px-4 py-2 text-left"><strong className="block break-words">{index === 0 ? `Explique-moi ${chapter.title}` : `Un exercice sur ${chapter.title}`}</strong><span className="text-sm text-muted">{chapter.subject} · {chapter.title}</span></button>;
        })}
        {fragileChapter && <button type="button" disabled={busy} onClick={() => void onSend(`Aide-moi à consolider ${fragileChapter.title} en ${fragileChapter.subject}`)} className="block min-h-16 w-full rounded-2xl border border-primary bg-tint px-4 py-2 text-left text-primary"><strong className="block break-words">Consolider {fragileChapter.title}</strong><span className="text-sm">Chapitre fragile · {fragileChapter.subject}</span></button>}
      </section>
      {profileError && <p role="status" className="text-sm text-muted">Tes matières sont temporairement indisponibles.</p>}
      {!profileLoaded && !profileError && <p role="status" className="text-sm text-muted">Chargement de tes matières…</p>}
      {subjects.length > 0 && <section className="space-y-2"><h2 className="text-sm font-bold text-muted">Tes matières</h2><div className="flex flex-wrap gap-2">{subjects.map(subject => <button key={subject} type="button" onClick={() => setPrompt(`Aide-moi en ${subject}`)} className="min-h-11 rounded-full border border-border bg-surface px-4 font-semibold">{subject}</button>)}</div></section>}
      <details className="rounded-2xl border border-border bg-surface p-4" {...chatsDetails}><summary className="min-h-11 cursor-pointer font-semibold">Mes discussions</summary><ul className="space-y-3">{chats.map(chat => <li key={chat.id}><Link to={`/chat?chatId=${encodeURIComponent(chat.id)}`} className="block min-h-11 truncate text-primary underline">{chat.title || 'Discussion sans titre'}</Link></li>)}</ul>{!chats.length && <p className="text-sm text-muted">Aucune discussion pour le moment.</p>}</details>
      <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
    </div>
  </main>;
}
