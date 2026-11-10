import React, { useEffect, useRef, useState } from "react";
import { AdaptiveErrorBoundary, adaptiveToast } from '@cognicatch/react'
import { Link, useNavigate } from "react-router-dom";
import PromptRail from "../components/Landing/PromptRail";
import PromptBox from "../components/Landing/PromptBox";
import ExploreTopics from "../components/Landing/ExploreTopics";
import { chatMultipart, chatJSON, getChats, type ChatInfo } from "../lib/api";

export default function Landing() {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  useEffect(() => {
    let active = true;
    getChats().then(result => { if (active) setChats(result.chats); }).catch(() => {});
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

    if (mode === "Quiz") {
      navigate(`/quiz?topic=${encodeURIComponent(q)}`, { state: { topic: q } });
      return;
    }

    setBusy(true);
    try {
      if (stagedFile) {
        const { chatId } = await chatMultipart(q || " ", [stagedFile]);
        navigate(`/chat?chatId=${encodeURIComponent(chatId)}&q=${encodeURIComponent(q)}`);
        return;
      }
      const r = await chatJSON({ q });
      navigate(`/chat?chatId=${encodeURIComponent(r.chatId)}&q=${encodeURIComponent(q)}`);
    } catch {
      adaptiveToast.error("Impossible de démarrer la discussion", "Impossible de joindre le Tuteur. Réessaie d’envoyer ta question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-background text-foreground flex flex-col min-h-screen w-full px-4 pb-28 md:pb-4 md:pl-28 lg:pr-4">
      <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto pt-8 md:pt-0 my-4 w-full px-0 md:px-2">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl text-foreground font-semibold pl-3 border-l-2 border-primary mb-5 md:mb-8">
          Que veux-tu comprendre aujourd’hui ?
        </h1>

        <AdaptiveErrorBoundary
          mode="manual"
          severity="medium"
          title="La saisie est indisponible"
          description="Impossible de charger la zone de saisie. Actualise la page pour continuer."
          theme={{
            backgroundColor: "var(--color-surface)",
            textColor: "var(--color-foreground)",
            primaryColor: "var(--color-primary)",
            fontFamily: "'Schibsted Grotesk', sans-serif",
            borderRadius: "24px"
          }}
        >
          <PromptBox
            value={prompt}
            onChange={setPrompt}
            onSend={() => onSend()}
            onPickFile={onPickFile}
            onRemoveFile={onRemoveFile}
            stagedFileName={stagedFile?.name || null}
            busy={busy}
            onDragOver={onDropZoneDragOver}
            onDrop={onDropZoneDrop}
          />
        </AdaptiveErrorBoundary>

        <div className="w-full md:w-fit flex">
          <div className="w-full md:w-fit md:min-w-fit p-1.5 rounded-2xl rounded-t-none bg-surface flex flex-col items-start sm:items-center border border-border border-t-0 border-r-0 border-b-0 sm:border-b shadow-[inset_2px_-2px_15px] shadow-border">
            <div className="flex items-start justify-between md:justify-start space-x-1 md:space-x-2 p-1.5 w-full">
              <div data-dropdown className="relative flex-1 md:flex-none">
                <div
                  onClick={() => setShowMode(!showMode)}
                  className="flex items-center space-x-1 p-1.5 rounded-xl hover:bg-tint duration-300 transition-[transform,opacity] cursor-pointer"
                >
                  <div className="flex flex-col -space-y-0.5 pr-2">
                    <span className="text-xs text-foreground">Mode</span>
                    <span className="text-sm font-semibold text-foreground">{mode}</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 text-muted">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                  </svg>
                </div>

                {showMode && (
                  <div className="absolute top-full left-0 mt-1 p-1 w-36 bg-surface border border-border rounded-xl shadow-lg z-20">
                    {["Discussion", "Quiz"].map((opt) => (
                      <div
                        key={opt}
                        onClick={() => {
                          setMode(opt as "Discussion" | "Quiz");
                          setShowMode(false);
                        }}
                        className={`px-3 py-3 md:py-2 cursor-pointer hover:bg-tint transition rounded-lg ${mode === opt ? "text-primary" : "text-foreground"
                          }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-8 mx-2 bg-tint rounded-full mt-2" />

              <div className="p-1.5 rounded-xl hover:bg-tint duration-300 transition-[transform,opacity] cursor-pointer min-w-fit h-fit hidden md:flex items-center space-x-4" onClick={onPickFile} title={stagedFile ? stagedFile.name : "Clique ou dépose un fichier"}>
                <div className="flex flex-col -space-y-0.5 pr-2">
                  <span className="text-xs text-foreground">{stagedFile ? "Fichier sélectionné" : "Ajouter des fichiers"}</span>
                  <span className="text-sm font-semibold text-foreground">{stagedFile ? stagedFile.name : "Clique ou dépose un fichier"}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-6 text-muted">
                  <path
                    fillRule="evenodd"
                    d="M5.5 17a4.5 4.5 0 0 1-1.44-8.765 4.5 4.5 0 0 1 8.302-3.046 3.5 3.5 0 0 1 4.504 4.272A4 4 0 0 1 15 17H5.5Zm3.75-2.75a.75.75 0 0 0 1.5 0V9.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0l-3.25 3.5a.75.75 0 1 0 1.1 1.02l1.95-2.1v4.59Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="w-px h-8 mx-2 bg-tint rounded-full mt-2" />

              <div data-dropdown className="relative flex-1 md:flex-none">
                <div
                  onClick={() => setShowLength(!showLength)}
                  className="flex items-center space-x-1 p-1.5 rounded-xl hover:bg-tint duration-300 transition-[transform,opacity] cursor-pointer">
                  <div className="flex flex-col -space-y-0.5 pr-2">
                    <span className="text-xs text-foreground">Longueur</span>
                    <span className="text-sm font-semibold text-foreground">{responseLength}</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 text-muted">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                  </svg>
                </div>

                {showLength && (
                  <div className="absolute top-full right-0 md:right-auto md:left-0 mt-1 p-1 w-40 bg-surface border border-border rounded-xl shadow-lg z-20">
                    {["Courte", "Moyenne", "Longue"].map((opt) => (
                      <div
                        key={opt}
                        onClick={() => {
                          setResponseLength(opt as "Courte" | "Moyenne" | "Longue");
                          setShowLength(false);
                        }}
                        className={`px-3 py-3 md:py-2 cursor-pointer hover:bg-tint transition rounded-lg ${responseLength === opt ? "text-primary" : "text-foreground"
                          }`}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          <svg className="h-9 w-8 -ml-0.5 -mt-[2px] min-w-fit hidden md:block rotate-3" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1H71C21.4764 5.44502 6.18653 20.4467 1 71V1Z" fill="var(--color-background)" strokeWidth="2" stroke="url(#paint0_linear_1409_7)" />
            <defs>
              <linearGradient id="paint0_linear_1409_7" x1="33" y1="31" x2="1" y2="1" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--color-border)" />
                <stop offset="1" stopColor="var(--color-border)" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          <PromptRail onSend={(p) => onSend(p)} />
        </div>
      </div>

      <ExploreTopics />
      <details className="mx-auto mb-6 w-full max-w-4xl rounded-2xl border border-border p-5">
        <summary className="cursor-pointer text-foreground">Mes discussions</summary>
        <ul className="mt-4 space-y-3">{chats.map(chat => <li key={chat.id}><Link to={`/chat?chatId=${encodeURIComponent(chat.id)}`} className="block truncate text-primary underline">{chat.title || 'Discussion sans titre'}</Link></li>)}</ul>
        {!chats.length && <p className="mt-3 text-sm text-muted">Aucune discussion pour le moment.</p>}
      </details>

      <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
    </div>
  );
}
