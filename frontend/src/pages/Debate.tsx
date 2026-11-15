import { LoadingState } from '../components/ui/LoadingState'
import { AlertIcon, BotIcon, ChartIcon, CheckIcon, CloseIcon, DumbbellIcon, HandshakeIcon, ScaleIcon, ThumbsDownIcon, ThumbsUpIcon, TrendingDownIcon, TrophyIcon, ZapIcon } from '../components/ui/NavigationIcons'
import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useOverlayNavigation } from "../lib/useOverlayNavigation";
import { withOccurrenceKeys } from "../lib/occurrenceKeys";
import { confirmDialog } from "../lib/confirm";
import { BackButton } from "../components/ui/BackButton";
import MarkdownContent from "../components/Chat/MarkdownContent";
import { ToolPage } from "../components/ui/ToolPage";
import * as api from "../lib/api";
import { runTask } from "../lib/taskRun";
import { useNavigate, useSearchParams } from "react-router-dom";

type DebateMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
};

type DebateSession = {
    id: string;
    topic: string;
    position: "for" | "against";
    messages: DebateMessage[];
    createdAt: number;
    status?: "active" | "user_surrendered" | "ai_conceded" | "completed";
    winner?: "user" | "ai" | "draw";
};

type DebateAnalysis = {
    winner: "user" | "ai" | "draw";
    reason: string;
    userStrengths: string[];
    aiStrengths: string[];
    userWeaknesses: string[];
    aiWeaknesses: string[];
    keyMoments: string[];
    overallAssessment: string;
};

const ARGUE_STREAM_ERROR = "Erreur de connexion";
const ANALYSIS_STREAM_ERROR = "Erreur de connexion à l’analyse";

export default function Debate() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [topic, setTopic] = useState("");
    const [position, setPosition] = useState<"for" | "against">("for");
    const [debateId, setDebateId] = useState<string | null>(
        searchParams.get("debateId")
    );
    const [session, setSession] = useState<DebateSession | null>(null);
    const [messages, setMessages] = useState<DebateMessage[]>([]);
    const [argument, setArgument] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<"loading" | DebateAnalysis | null>(null);
    const isDebateEnded = analysisState !== null;
    const analysis = typeof analysisState === "object" ? analysisState : null;
    const [analysisOpen, setAnalysisOpen] = useOverlayNavigation("debate-analysis", () => {
        analysisRunRef.current?.cancel();
        analysisRunRef.current = null;
        setAnalysisState(null);
    });
    // Escape closes the analysis dialog, same as its « Fermer » button (the debate itself stays ended).
    useEffect(() => {
        if (!isDebateEnded || !analysis) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setAnalysisOpen(false); } };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isDebateEnded, analysis, setAnalysisOpen]);

    const argueRunRef = useRef<{ cancel: () => void } | null>(null);
    const analysisRunRef = useRef<{ cancel: () => void } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [analysisPhase, setAnalysisPhase] = useState<string>("");

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: Faire défiler à chaque message ou fragment reçu.
    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: La connexion et ses gestionnaires appartiennent à l'identifiant du débat courant.
    useEffect(() => {
        if (debateId) {
            fetchDebateSession(debateId);
        }
        return () => {
            argueRunRef.current?.cancel();
            argueRunRef.current = null;
            analysisRunRef.current?.cancel();
            analysisRunRef.current = null;
        };
    }, [debateId]);

    const fetchDebateSession = async (id: string) => {
        try {
            const data = await api.getDebateSession(id);
            if (data.ok) {
                setSession(data.session);
                setMessages(data.session.messages);
            } else {
                setError("Impossible de charger le débat");
            }
        } catch {
            setError("Impossible de charger le débat");
        }
    };

    const onArgueEvent = (data: api.DebateEvent) => {
        switch (data.type) {
            case "user_argument":
                setMessages((prev) => [
                    ...prev,
                    { role: "user", content: data.content, timestamp: Date.now() },
                ]);
                break;

            case "ai_thinking":
                setIsStreaming(true);
                setStreamingContent("");
                break;

            case "ai_token":
                setStreamingContent((prev) => prev + data.token);
                break;

            case "ai_complete":
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.content, timestamp: Date.now() },
                ]);
                setIsStreaming(false);
                setStreamingContent("");
                break;

            case "ai_concede":
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: `Je m’avoue vaincue : ${data.reason}`, timestamp: Date.now() },
                ]);
                setIsStreaming(false);
                setStreamingContent("");
                setAnalysisState("loading");
                // Automatically fetch analysis
                setTimeout(() => fetchAnalysis(), 1000);
                break;

            case "error":
                setError(data.error === ARGUE_STREAM_ERROR ? ARGUE_STREAM_ERROR : "L’IA n’a pas pu répondre. Réessaie.");
                setIsStreaming(false);
                setStreamingContent("");
                break;

            case "done":
                argueRunRef.current = null;
                break;
        }
    };

    const startDebate = async () => {
        if (!topic.trim()) return;

        try {
            const data = await api.startDebate(topic.trim(), position);
            if (data.ok) {
                setDebateId(data.debateId);
                setSession({ ...data.session, messages: [] });
                setMessages([]);
                navigate(`/debate?debateId=${data.debateId}`);
            } else {
                setError("Impossible de démarrer le débat");
            }
        } catch {
            setError("Impossible de démarrer le débat");
        }
    };

    const submitArgument = async () => {
        if (!argument.trim() || !debateId || isStreaming || argueRunRef.current) return;

        const userArgument = argument.trim();
        setArgument("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        argueRunRef.current = runTask<api.DebateEvent>({
            start: async () => {
                const data = await api.submitDebateArgument(debateId, userArgument);
                if (!data.ok) throw new Error(data.error);
                return data.taskId;
            },
            connect: api.connectDebateStream,
            cancel: api.cancelDebateTask,
            onEvent: onArgueEvent,
            onStartError: () => {
                argueRunRef.current = null;
                setError("Impossible d’envoyer ton argument");
            },
            streamError: ARGUE_STREAM_ERROR,
        });
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setArgument(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitArgument();
        }
    };

    const handleSurrender = async () => {
        if (!debateId || isDebateEnded) return;

        if (!(await confirmDialog("Veux-tu terminer ce débat ?", "Terminer"))) return;

        try {
            const data = await api.surrenderDebate(debateId);
            if (data.ok) {
                setAnalysisState("loading");
                fetchAnalysis();
            } else {
                setError("Impossible de terminer le débat");
            }
        } catch {
            setError("Impossible de terminer le débat");
        }
    };

    const fetchAnalysis = () => {
        if (!debateId) return;

        setAnalysisOpen(true);
        setAnalysisState("loading");
        setAnalysisPhase("Début de l’analyse…");

        const failed = (message: string) => {
            analysisRunRef.current = null;
            setError(message);
            setAnalysisState(null);
            setAnalysisOpen(false);
            setAnalysisPhase("");
        };
        analysisRunRef.current = runTask<api.DebateEvent>({
            start: async () => {
                const data = await api.analyzeDebate(debateId);
                if (!data.ok) throw new Error(data.error);
                return data.taskId;
            },
            connect: api.connectDebateStream,
            cancel: api.cancelDebateTask,
            onEvent: (data) => {
                switch (data.type) {
                    case "phase":
                        setAnalysisPhase("Préparation du bilan…");
                        break;

                    case "complete":
                        setAnalysisState(data.analysis);
                        setSession(data.session);
                        setAnalysisPhase("");
                        break;

                    case "done":
                        analysisRunRef.current = null;
                        break;

                    case "error":
                        failed(data.error === ANALYSIS_STREAM_ERROR ? ANALYSIS_STREAM_ERROR : "L’analyse du débat a échoué. Réessaie.");
                        break;
                }
            },
            onStartError: () => failed("Impossible de lancer l’analyse"),
            streamError: ANALYSIS_STREAM_ERROR,
        });
    };

    if (!debateId) {
        return (
            <ToolPage title="Débat">
                <div className="w-full space-y-4">
                    <div className="space-y-1">
                        <h2 className="ui-section-title">Commencer un débat</h2>
                        <p className="text-sm text-muted">
                            Défends ton point de vue dans un débat avec l’IA
                        </p>
                    </div>

                    <div className="p-5 space-y-5 ui-card">
                        <div>
                            <label htmlFor="debate-topic" className="block text-sm font-medium text-foreground mb-2">
                                Sujet du débat
                            </label>
                            <input
                                id="debate-topic"
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="Ex. : l’IA à l’école"
                                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                onKeyDown={(e) => e.key === "Enter" && startDebate()}
                            />
                        </div>

                        <fieldset>
                            <legend className="block text-sm font-medium text-foreground mb-3">
                                Ton point de vue
                            </legend>
                            <div className="flex gap-2">
                                <button type="button"
                                    onClick={() => setPosition("for")}
                                    aria-pressed={position === "for"}
                                    className={`min-w-0 flex-1 py-4 px-2 rounded-xl font-semibold transition-[transform,opacity] ${position === "for"
                                        ? "bg-tint border-2 border-primary text-foreground"
                                        : "bg-surface border border-border text-muted hover:bg-tint"
                                        }`}
                                >
                                    <div className="mb-1"><ThumbsUpIcon className="size-8" /></div>
                                    <div>Pour</div>
                                    <div className="text-xs mt-1 opacity-80">Défendre cette idée</div>
                                </button>
                                <button type="button"
                                    onClick={() => setPosition("against")}
                                    aria-pressed={position === "against"}
                                    className={`min-w-0 flex-1 py-4 px-2 rounded-xl font-semibold transition-[transform,opacity] ${position === "against"
                                        ? "bg-tint border-2 border-primary text-foreground"
                                        : "bg-surface border border-border text-muted hover:bg-tint"
                                        }`}
                                >
                                    <div className="mb-1"><ThumbsDownIcon className="size-8" /></div>
                                    <div>Contre</div>
                                    <div className="text-xs mt-1 opacity-80">Contester cette idée</div>
                                </button>
                            </div>
                        </fieldset>

                        <button type="button"
                            onClick={startDebate}
                            disabled={!topic.trim()}
                            className="w-full py-4 bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary disabled:from-tint disabled:to-tint disabled:cursor-not-allowed disabled:text-muted text-on-primary font-bold rounded-xl transition-[transform,opacity] shadow-lg"
                        >
                            Commencer le débat
                        </button>
                        {!topic.trim() && <p className="text-sm text-muted">Saisis un sujet pour commencer.</p>}
                    </div>

                    {error && (
                        <div className="bg-tint border border-primary rounded-xl p-4 text-foreground">
                            {error}
                        </div>
                    )}
                </div>
            </ToolPage>
        );
    }

    return (
        <div className="flex flex-col h-dvh w-full md:pl-28 bg-background text-foreground">
            <header className="flex-shrink-0 px-4 pt-4">
                <div className="flex items-center gap-2">
                    <BackButton fallback="/courses" />
                    <div className="min-w-0 flex-1"><h1 className="ui-title">Débat</h1><p className="text-sm text-muted">{messages.filter(message => message.role === "user").length} échange(s)</p></div>
                    <span className="rounded-full border border-border bg-tint px-3 py-1 text-xs font-medium">BÊTA</span>
                    <button type="button" onClick={() => { setDebateId(null); setSession(null); setMessages([]); navigate("/debate"); }} className="ui-button-ghost text-sm">Nouveau débat</button>
                </div>
                <div className="mt-1 px-4 py-3 ui-card">
                    <h2 title={session?.topic} className="ui-card-title">{session?.topic || "Débat"}</h2>
                    <div className="mt-2 flex gap-2 text-xs font-bold">
                        <span className="rounded-xl bg-tint px-3 py-1 text-primary">Toi : {session?.position === "for" ? "pour" : "contre"}</span>
                        <span className="rounded-xl border border-border bg-background px-3 py-1 text-muted">Lohni : {session?.position === "for" ? "contre" : "pour"}</span>
                    </div>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scroll">
                {messages.length === 0 && !isStreaming && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4 max-w-md">
                            <div className="animate-[fadeIn_0.5s_ease-in-out]"><ScaleIcon className="size-16" /></div>
                            <h2 className="ui-section-title animate-[fadeIn_0.6s_ease-in-out]">
                                Prêt à débattre !
                            </h2>
                            <p className="text-muted animate-[fadeIn_0.7s_ease-in-out]">
                                Présente ton premier argument. L’IA proposera un
                                contre-argument.
                            </p>
                        </div>
                    </div>
                )}

                {withOccurrenceKeys(messages, message => JSON.stringify([message.role, message.timestamp])).map(({ value: msg, key }) => (
                    <div key={key} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[84%] px-4 py-3 rounded-2xl ${msg.role === "user" ? "rounded-br-md bg-tint" : "rounded-bl-md border border-border bg-surface"}`}>
                            <div className={`mb-1 text-sm font-bold text-muted ${msg.role === "user" ? "text-right" : ""}`}>{msg.role === "user" ? "Toi" : "Lohni"}</div>
                            {msg.role === "user" ? <p className="whitespace-pre-wrap leading-snug">{msg.content}</p> : <div className="leading-snug [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"><MarkdownContent md={msg.content} /></div>}
                        </div>
                    </div>
                ))}
                {isStreaming && <div className="max-w-[84%] rounded-bl-md px-4 py-3 text-muted ui-card"><span className="mb-1 block text-sm font-bold">Lohni</span>{streamingContent ? <div className="leading-snug [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"><MarkdownContent md={streamingContent} /></div> : "Lohni réfléchit…"}</div>}

                <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0 border-t border-border bg-surface backdrop-blur-sm p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="flex gap-2 overflow-x-auto mb-3">
                        {[["Donne-moi un indice", "Peux-tu me donner un indice ?"], ["Un exemple concret", "Prenons un exemple concret : "], ["Je ne suis pas d’accord car…", "Je ne suis pas d’accord car "]].map(([suggestion, draft]) => (
                            <button type="button" key={suggestion} disabled={isStreaming || isDebateEnded}
                                onClick={() => { setArgument(draft); textareaRef.current?.focus(); }}
                                className="min-h-11 shrink-0 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary disabled:opacity-50">
                                {suggestion}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3 mb-2">
                        <textarea
                            ref={textareaRef}
                            aria-label="Ton argument"
                            value={argument}
                            onChange={handleTextareaChange}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                isDebateEnded
                                    ? "Le débat est terminé"
                                    : isStreaming
                                        ? "L’IA prépare sa réponse…"
                                        : "Écris ton argument…"
                            }
                            disabled={isStreaming || isDebateEnded}
                            className="min-w-0 flex-1 px-4 py-3 bg-background border border-border rounded-2xl text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed custom-scroll"
                            rows={1}
                            style={{ minHeight: "50px", maxHeight: "120px" }}
                        />
                        <button type="button"
                            onClick={submitArgument}
                            aria-label="Envoyer"
                            disabled={!argument.trim() || isStreaming || isDebateEnded}
                            className="self-start grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary transition-[transform,opacity] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </button>
                    </div>
                    {!argument.trim() && !isStreaming && !isDebateEnded && <p className="text-sm text-muted">Écris un argument pour l’envoyer.</p>}
                    {isStreaming && <p className="text-sm text-muted">Attends la réponse de l’IA pour continuer ou terminer.</p>}
                    {!isStreaming && messages.length === 0 && <p className="text-sm text-muted">Envoie un argument pour pouvoir terminer.</p>}
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                        <p className="text-sm text-muted">2 échanges minimum pour un bilan pertinent.</p>
                        <button type="button"
                            onClick={handleSurrender}
                            disabled={isStreaming || messages.length === 0 || isDebateEnded}
                            className="ui-button-secondary text-sm"
                        >
                            Terminer le débat
                        </button>
                    </div>
                </div>
            </div>

            {analysisOpen && isDebateEnded && analysis && (
                <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-[var(--z-modal)] animate-[fadeIn_0.3s_ease-in-out]" role="dialog" aria-modal="true">
                    <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scroll shadow-2xl animate-[scaleIn_0.3s_ease-out] ui-card">
                        <div className="p-8 space-y-6">
                            {/* Header */}
                            <div className="text-center space-y-4">
                                <div className="text-6xl">
                                    {analysis.winner === "user" ? <TrophyIcon className="size-16" /> : analysis.winner === "ai" ? <BotIcon className="size-16" /> : <HandshakeIcon className="size-16" />}
                                </div>
                                <h2 className="ui-title">
                                    {analysis.winner === "user"
                                        ? "Tu as gagné !"
                                        : analysis.winner === "ai"
                                            ? "L’IA a gagné !"
                                            : "Égalité !"}
                                </h2>
                                <p className="text-lg text-muted">{analysis.reason}</p>
                            </div>

                            {/* Overall Assessment */}
                            <div className="p-6 ui-card">
                                <h3 className="ui-section-title mb-3"><ChartIcon /> Bilan général</h3>
                                <p className="text-foreground leading-relaxed">{analysis.overallAssessment}</p>
                            </div>

                            {/* Two Column Layout for Strengths/Weaknesses */}
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* User Performance */}
                                <div className="space-y-4">
                                    <div className="bg-tint border border-success rounded-xl p-5">
                                        <h3 className="ui-section-title mb-3"><DumbbellIcon /> Tes points forts</h3>
                                        <ul className="space-y-2">
                                            {withOccurrenceKeys(analysis.userStrengths, value => value).map(({ value: strength, key }) => (
                                                <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                    <span className="mt-0.5 text-success"><CheckIcon className="size-4" /></span>
                                                    <span>{strength}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {analysis.userWeaknesses.length > 0 && (
                                        <div className="bg-tint border border-danger rounded-xl p-5">
                                            <h3 className="ui-section-title mb-3"><TrendingDownIcon /> Points à améliorer</h3>
                                            <ul className="space-y-2">
                                                {withOccurrenceKeys(analysis.userWeaknesses, value => value).map(({ value: weakness, key }) => (
                                                    <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                        <span className="mt-0.5 text-foreground"><CloseIcon className="size-4" /></span>
                                                        <span>{weakness}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* AI Performance */}
                                <div className="space-y-4">
                                    <div className="bg-tint border border-border rounded-xl p-5">
                                        <h3 className="ui-section-title mb-3"><BotIcon /> Points forts de l’IA</h3>
                                        <ul className="space-y-2">
                                            {withOccurrenceKeys(analysis.aiStrengths, value => value).map(({ value: strength, key }) => (
                                                <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                    <span className="mt-0.5 text-foreground"><CheckIcon className="size-4" /></span>
                                                    <span>{strength}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {analysis.aiWeaknesses.length > 0 && (
                                        <div className="bg-tint border border-danger rounded-xl p-5">
                                            <h3 className="ui-section-title mb-3"><TrendingDownIcon /> Points faibles de l’IA</h3>
                                            <ul className="space-y-2">
                                                {withOccurrenceKeys(analysis.aiWeaknesses, value => value).map(({ value: weakness, key }) => (
                                                    <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                        <span className="mt-0.5 text-foreground"><CloseIcon className="size-4" /></span>
                                                        <span>{weakness}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Key Moments */}
                            {analysis.keyMoments.length > 0 && (
                                <div className="p-6 ui-card">
                                    <h3 className="ui-section-title mb-3"><ZapIcon /> Moments clés</h3>
                                    <ul className="space-y-3">
                                        {withOccurrenceKeys(analysis.keyMoments, value => value).map(({ value: moment, key }, idx) => (
                                            <li key={key} className="text-foreground flex items-start gap-3">
                                                <span className="text-primary font-bold text-sm mt-0.5">{idx + 1}.</span>
                                                <span>{moment}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-4 pt-4">
                                <button type="button"
                                    onClick={() => {
                                        setDebateId(null);
                                        setSession(null);
                                        setMessages([]);
                                        setAnalysisOpen(false);
                                        navigate("/debate");
                                    }}
                                    className="flex-1 py-3 bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-on-primary font-bold rounded-xl transition-[transform,opacity] shadow-lg"
                                >
                                    Nouveau débat
                                </button>
                                <button type="button"
                                    onClick={() => {
                                        setAnalysisOpen(false);
                                    }}
                                    className="px-6 py-3 bg-surface border border-border hover:bg-tint text-foreground font-semibold rounded-xl transition-opacity"
                                >
                                    Relire le débat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {analysisOpen && analysisState === "loading" && (
                <div className="fixed inset-0 bg-background flex items-center justify-center z-[var(--z-modal)]" role="dialog" aria-modal="true">
                    <LoadingState label="Analyse du débat…" steps={analysisPhase ? [{ after: 0, message: analysisPhase }] : undefined} expectedDuration={analysisPhase ? 30 : undefined} />
                </div>
            )}

            {error && (
                <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[var(--z-toast)] bg-tint border border-primary rounded-xl p-4 text-foreground shadow-lg md:left-auto md:right-6 md:max-w-md">
                    <div className="flex items-start gap-3">
                        <AlertIcon className="size-6 shrink-0" />
                        <div className="flex-1">{error}</div>
                        <button type="button"
                            onClick={() => setError(null)}
                            aria-label="Fermer le message d’erreur" className="grid size-11 place-items-center text-foreground hover:text-foreground"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
