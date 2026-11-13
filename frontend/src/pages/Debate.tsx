import { ZapIcon, TrophyIcon, DumbbellIcon, ThumbsUpIcon, ThumbsDownIcon, ScaleIcon, FlagIcon, BotIcon, HandshakeIcon, ChartIcon, TrendingDownIcon, AlertIcon } from '../components/ui/NavigationIcons'
import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useOverlayNavigation } from "../lib/useOverlayNavigation";
import { withOccurrenceKeys } from "../lib/occurrenceKeys";
import { confirmDialog } from "../lib/confirm";
import { ToolPage } from "../components/ui/ToolPage";
import * as api from "../lib/api";
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
        const socket = analysisWsRef.current;
        analysisWsRef.current = null;
        socket?.close();
        setAnalysisState(null);
    });
    // Escape closes the analysis dialog, same as its « Fermer » button (the debate itself stays ended).
    useEffect(() => {
        if (!isDebateEnded || !analysis) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setAnalysisOpen(false); } };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isDebateEnded, analysis, setAnalysisOpen]);

    const wsRef = useRef<WebSocket | null>(null);
    const analysisWsRef = useRef<WebSocket | null>(null);
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
            connectWebSocket(debateId);
        }
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (analysisWsRef.current) {
                analysisWsRef.current.close();
            }
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

    const connectWebSocket = (id: string) => {
        const ws = new WebSocket(api.wsURL(`/ws/debate?debateId=${encodeURIComponent(id)}`));

        ws.onopen = () => {
            console.log("WebSocket connected");
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case "ready":
                    console.log("Debate WebSocket ready");
                    break;

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
                    setError("L’IA n’a pas pu répondre. Réessaie.");
                    setIsStreaming(false);
                    setStreamingContent("");
                    break;
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setError("Erreur de connexion");
        };

        ws.onclose = () => {
            console.log("WebSocket closed");
        };

        wsRef.current = ws;
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
        if (!argument.trim() || !debateId || isStreaming) return;

        const userArgument = argument.trim();
        setArgument("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        try {
            const data = await api.submitDebateArgument(debateId, userArgument);
            if (!data.ok) {
                setError("Impossible d’envoyer ton argument");
            }
        } catch {
            setError("Impossible d’envoyer ton argument");
        }
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

    const requestAnalysis = async (id: string, analysisWs: WebSocket) => {
        try {
            const data = await api.analyzeDebate(id);
            if (analysisWsRef.current !== analysisWs) return;
            if (!data.ok) {
                setError("Impossible de lancer l’analyse");
                setAnalysisOpen(false);
                setAnalysisState(null);
                setAnalysisPhase("");
                analysisWs.close();
            }
        } catch {
            if (analysisWsRef.current !== analysisWs) return;
            setError("Impossible de lancer l’analyse");
            setAnalysisOpen(false);
            setAnalysisState(null);
            setAnalysisPhase("");
            analysisWs.close();
        }
    };

    const fetchAnalysis = async () => {
        if (!debateId) return;

        setAnalysisOpen(true);
        setAnalysisState("loading");
        setAnalysisPhase("Début de l’analyse…");

        // Connect to analysis WebSocket first
        const analysisWs = new WebSocket(api.wsURL(`/ws/debate/analyze?debateId=${encodeURIComponent(debateId)}`));

        analysisWs.onopen = () => {
            console.log("Analysis WebSocket connected");
        };

        analysisWs.onmessage = (event) => {
            if (analysisWsRef.current !== analysisWs) return;
            const data = JSON.parse(event.data);

            switch (data.type) {
                case "ready":
                    // The server streams only to sockets registered before the request.
                    void requestAnalysis(debateId, analysisWs);
                    break;

                case "phase":
                    setAnalysisPhase("Préparation du bilan…");
                    break;

                case "complete":
                    setAnalysisState(data.analysis);
                    setSession(data.session);
                    setAnalysisPhase("");
                    analysisWs.close();
                    break;

                case "error":
                    setError("L’analyse du débat a échoué. Réessaie.");
                    setAnalysisState(null);
                    setAnalysisOpen(false);
                    setAnalysisPhase("");
                    analysisWs.close();
                    break;
            }
        };

        analysisWs.onerror = (error) => {
            if (analysisWsRef.current !== analysisWs) return;
            console.error("Analysis WebSocket error:", error);
            setError("Erreur de connexion à l’analyse");
            setAnalysisOpen(false);
            setAnalysisState(null);
            setAnalysisPhase("");
        };

        analysisWs.onclose = () => {
            console.log("Analysis WebSocket closed");
        };

        analysisWsRef.current = analysisWs;

    };

    if (!debateId) {
        return (
            <ToolPage title="Débat">
                <div className="w-full space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-foreground">Commencer un débat</h2>
                        <p className="text-sm text-muted">
                            Défends ton point de vue dans un débat avec l’IA
                        </p>
                    </div>

                    <div className="bg-surface border border-border rounded-2xl p-5 space-y-5">
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
                                        ? "bg-secondary text-on-secondary shadow-lg"
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
                                        ? "bg-primary text-on-primary shadow-lg"
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
        <div className="flex flex-col h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] md:h-dvh w-full md:pl-28 bg-background text-foreground">
            <div className="flex-shrink-0 border-b border-border bg-surface backdrop-blur-sm">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                            <h1 title={session?.topic} className="line-clamp-2 text-xl font-bold text-foreground mb-1">
                                {session?.topic || "Debate"}
                            </h1>
                            <div className="flex items-center gap-3 text-sm">
                                <span
                                    className={`px-3 py-1 rounded-full font-semibold ${session?.position === "for"
                                        ? "bg-tint text-foreground border border-secondary"
                                        : "bg-tint text-foreground border border-primary"
                                        }`}
                                >
                                    Toi : {session?.position === "for" ? "Pour" : "Contre"}
                                </span>
                                <span className="text-muted">contre</span>
                                <span className="px-3 py-1 rounded-full font-semibold bg-tint text-foreground border border-border">
                                    IA : {session?.position === "for" ? "Contre" : "Pour"}
                                </span>
                            </div>
                        </div>
                        <button type="button"
                            onClick={() => {
                                setDebateId(null);
                                setSession(null);
                                setMessages([]);
                                navigate("/debate");
                            }}
                            className="px-4 py-2 bg-surface border border-border hover:bg-tint text-foreground rounded-lg transition-opacity"
                        >
                            Nouveau débat
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scroll">
                {messages.length === 0 && !isStreaming && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4 max-w-md">
                            <div className="animate-[fadeIn_0.5s_ease-in-out]"><ScaleIcon className="size-16" /></div>
                            <h2 className="text-2xl font-bold text-foreground animate-[fadeIn_0.6s_ease-in-out]">
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
                    <div
                        key={key}
                        className={`flex ${msg.role === "user" ? "justify-end animate-[slideInRight_0.3s_ease-out]" : "justify-start animate-[slideInLeft_0.3s_ease-out]"}`}
                    >
                        <div
                            className={`max-w-3xl ${msg.role === "user" ? "items-end" : "items-start"
                                } flex flex-col gap-2`}
                        >
                            <div className="flex items-center gap-2">
                                {msg.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-on-primary font-bold shadow-lg">
                                        IA
                                    </div>
                                )}
                                <span className="text-sm font-semibold text-muted">
                                    {msg.role === "user" ? "Toi" : "Adversaire IA"}
                                </span>
                                {msg.role === "user" && (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-foreground font-bold shadow-lg ${session?.position === "for"
                                        ? "bg-gradient-to-br from-secondary to-secondary"
                                        : "bg-gradient-to-br from-primary to-primary"
                                        }`}>
                                        U
                                    </div>
                                )}
                            </div>
                            <div
                                className={`px-6 py-4 rounded-2xl shadow-lg transition-[transform,opacity] hover:shadow-xl ${msg.role === "user"
                                    ? session?.position === "for"
                                        ? "bg-gradient-to-br from-secondary to-secondary text-on-secondary"
                                        : "bg-gradient-to-br from-primary to-primary text-on-primary"
                                    : "bg-surface border border-border ring-1 ring-border backdrop-blur text-foreground"
                                    }`}
                            >
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {isStreaming && (
                    <div className="flex justify-start animate-[slideInLeft_0.3s_ease-out]">
                        <div className="max-w-3xl items-start flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-on-primary font-bold shadow-lg">
                                    IA
                                </div>
                                <span className="text-sm font-semibold text-muted">
                                    Adversaire IA
                                </span>
                            </div>
                            <div className="px-6 py-4 rounded-2xl shadow-lg bg-surface border border-border ring-1 ring-border backdrop-blur text-foreground">
                                <p className="whitespace-pre-wrap leading-relaxed">
                                    {streamingContent}
                                    <span className="inline-block w-2 h-5 bg-gradient-to-r from-primary to-primary ml-1 animate-pulse rounded-sm" />
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0 border-t border-border bg-surface backdrop-blur-sm p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="flex gap-3 mb-3">
                        <textarea
                            ref={textareaRef}
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
                            className="min-w-0 flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed custom-scroll"
                            rows={1}
                            style={{ minHeight: "50px", maxHeight: "120px" }}
                        />
                        <button type="button"
                            onClick={submitArgument}
                            disabled={!argument.trim() || isStreaming || isDebateEnded}
                            className={`self-start px-6 py-3 rounded-xl font-semibold transition-[transform,opacity] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${session?.position === "for"
                                ? "bg-gradient-to-r from-secondary to-secondary hover:from-secondary hover:to-secondary text-on-secondary"
                                : "bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-on-primary"
                                }`}
                        >
                            {isStreaming ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-border border-t-transparent rounded-full animate-spin" />
                                    <span>Patiente…</span>
                                </div>
                            ) : (
                                "Argumenter"
                            )}
                        </button>
                    </div>
                    <div className="flex items-center justify-center">
                        <button type="button"
                            onClick={handleSurrender}
                            disabled={isStreaming || messages.length === 0 || isDebateEnded}
                            className="px-4 py-2 bg-tint hover:bg-tint border border-border hover:border-border text-foreground hover:text-foreground rounded-lg transition-[transform,opacity] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                        >
                            <FlagIcon /> Terminer le débat
                        </button>
                    </div>
                </div>
            </div>

            {analysisOpen && isDebateEnded && analysis && (
                <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-[var(--z-modal)] animate-[fadeIn_0.3s_ease-in-out]" role="dialog" aria-modal="true">
                    <div className="bg-surface border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scroll shadow-2xl animate-[scaleIn_0.3s_ease-out]">
                        <div className="p-8 space-y-6">
                            {/* Header */}
                            <div className="text-center space-y-4">
                                <div className="text-6xl">
                                    {analysis.winner === "user" ? <TrophyIcon className="size-16" /> : analysis.winner === "ai" ? <BotIcon className="size-16" /> : <HandshakeIcon className="size-16" />}
                                </div>
                                <h2 className="text-3xl font-bold text-foreground">
                                    {analysis.winner === "user"
                                        ? "Tu as gagné !"
                                        : analysis.winner === "ai"
                                            ? "L’IA a gagné !"
                                            : "Égalité !"}
                                </h2>
                                <p className="text-lg text-muted">{analysis.reason}</p>
                            </div>

                            {/* Overall Assessment */}
                            <div className="bg-surface border border-border rounded-xl p-6">
                                <h3 className="text-xl font-bold text-foreground mb-3"><ChartIcon /> Bilan général</h3>
                                <p className="text-foreground leading-relaxed">{analysis.overallAssessment}</p>
                            </div>

                            {/* Two Column Layout for Strengths/Weaknesses */}
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* User Performance */}
                                <div className="space-y-4">
                                    <div className="bg-tint border border-success rounded-xl p-5">
                                        <h3 className="text-lg font-bold text-foreground mb-3"><DumbbellIcon /> Tes points forts</h3>
                                        <ul className="space-y-2">
                                            {withOccurrenceKeys(analysis.userStrengths, value => value).map(({ value: strength, key }) => (
                                                <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                    <span className="text-secondary mt-0.5">✓</span>
                                                    <span>{strength}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {analysis.userWeaknesses.length > 0 && (
                                        <div className="bg-tint border border-danger rounded-xl p-5">
                                            <h3 className="text-lg font-bold text-foreground mb-3"><TrendingDownIcon /> Points à améliorer</h3>
                                            <ul className="space-y-2">
                                                {withOccurrenceKeys(analysis.userWeaknesses, value => value).map(({ value: weakness, key }) => (
                                                    <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                        <span className="text-foreground mt-0.5">✗</span>
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
                                        <h3 className="text-lg font-bold text-foreground mb-3"><BotIcon /> Points forts de l’IA</h3>
                                        <ul className="space-y-2">
                                            {withOccurrenceKeys(analysis.aiStrengths, value => value).map(({ value: strength, key }) => (
                                                <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                    <span className="text-foreground mt-0.5">✓</span>
                                                    <span>{strength}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {analysis.aiWeaknesses.length > 0 && (
                                        <div className="bg-tint border border-danger rounded-xl p-5">
                                            <h3 className="text-lg font-bold text-foreground mb-3"><TrendingDownIcon /> Points faibles de l’IA</h3>
                                            <ul className="space-y-2">
                                                {withOccurrenceKeys(analysis.aiWeaknesses, value => value).map(({ value: weakness, key }) => (
                                                    <li key={key} className="text-foreground text-sm flex items-start gap-2">
                                                        <span className="text-foreground mt-0.5">✗</span>
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
                                <div className="bg-surface border border-border rounded-xl p-6">
                                    <h3 className="text-xl font-bold text-foreground mb-4"><ZapIcon /> Moments clés</h3>
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
                    <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-4 min-w-[300px]">
                        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-foreground font-semibold">Analyse du débat…</p>
                        {analysisPhase && (
                            <p className="text-primary text-sm animate-pulse">{analysisPhase}</p>
                        )}
                    </div>
                </div>
            )}

            {error && (
                <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[var(--z-toast)] bg-tint border border-primary rounded-xl p-4 text-foreground shadow-lg md:left-auto md:right-6 md:max-w-md">
                    <div className="flex items-start gap-3">
                        <AlertIcon className="size-6 shrink-0" />
                        <div className="flex-1">{error}</div>
                        <button type="button"
                            onClick={() => setError(null)}
                            className="text-foreground hover:text-foreground"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
