import llm from "../../utils/llm/llm";
import db from "../../utils/database/keyv";
import { toText } from "../../lib/ai/structured";

export type DebateMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
};

export type DebateSession = {
    id: string;
    topic: string;
    position: "for" | "against";
    messages: DebateMessage[];
    createdAt: number;
    status?: "active" | "user_surrendered" | "ai_conceded" | "completed";
    winner?: "user" | "ai" | "draw";
};

export type DebateAnalysis = {
    winner: "user" | "ai" | "draw";
    reason: string;
    userStrengths: string[];
    aiStrengths: string[];
    userWeaknesses: string[];
    aiWeaknesses: string[];
    keyMoments: string[];
    overallAssessment: string;
};

const DEBATE_LIST_KEY = "debate:sessions";

async function getDebatesList(): Promise<{ id: string }[]> {
    return (await db.get(DEBATE_LIST_KEY)) || [];
}

export async function createDebateSession(topic: string, position: "for" | "against"): Promise<DebateSession> {
    const id = `debate_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const session: DebateSession = {
        id,
        topic,
        position,
        messages: [],
        createdAt: Date.now(),
    };

    const list = await getDebatesList();
    list.push({ id });
    await db.set(DEBATE_LIST_KEY, list);

    await db.set(`debate:session:${id}`, session);
    return session;
}

export async function getDebateSession(id: string): Promise<DebateSession | null> {
    const session = await db.get(`debate:session:${id}`);
    return session || null;
}

export async function addDebateMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string
): Promise<void> {
    const session = await getDebateSession(sessionId);
    if (session) {
        session.messages.push({
            role,
            content,
            timestamp: Date.now(),
        });
        await db.set(`debate:session:${sessionId}`, session);
    }
}

export async function* streamDebateResponse(
    sessionId: string,
    userArgument: string
): AsyncGenerator<string | { type: "concede"; reason: string }, void, unknown> {
    const session = await getDebateSession(sessionId);
    if (!session) {
        throw new Error("Debate session not found");
    }

    await addDebateMessage(sessionId, "user", userArgument);

    const opposingPosition = session.position === "for" ? "against" : "for";

    // Check if AI should concede (after 3+ exchanges, detect weak position)
    const shouldCheckConcede = session.messages.length >= 6; // 3+ exchanges

    const systemPrompt = `Tu es un spécialiste du débat sur le sujet « ${session.topic} ».
Tu défends la position ${opposingPosition === "for" ? "pour" : "contre"} et l’élève défend la position ${session.position === "for" ? "pour" : "contre"}.
${shouldCheckConcede ? `Si tu n’as plus d’argument solide ou si tu ne peux raisonnablement réfuter l’élève, commence exactement par « [CONCEDE] », suivi d’une brève explication.\n` : ""}
Présente des arguments solides et logiques, étayés d’exemples et de preuves. Réponds directement aux arguments de l’élève, relève les faiblesses de son raisonnement et anticipe les objections. Sois respectueux, persuasif, affirmé et intellectuellement honnête. Structure ta réponse en un ou deux paragraphes, davantage si nécessaire pour un argument solide. Réponds en français en tutoyant l’élève.`;

    const conversationHistory = session.messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Élève" : "IA"}: ${m.content}`)
        .join("\n\n");

    const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: `Échanges précédents :\n${conversationHistory}\n\nDernier argument de l’élève :\n${userArgument}\n\nTon contre-argument : réponds avec une réfutation solide${shouldCheckConcede ? ", ou commence par [CONCEDE] si tu n’as plus d’argument solide" : ""}.` }
    ];

    const response = await llm.call(messages);
    const fullResponse = toText(response).trim();

    const concession = fullResponse.match(/^[\s«»“”"']*\[\s*CONCEDE\s*\][\s«»“”"']*/i);
    if (concession) {
        const concedeReason = fullResponse.slice(concession[0].length).trim();
        session.status = "ai_conceded";
        session.winner = "user";
        await db.set(`debate:session:${sessionId}`, session);

        yield { type: "concede", reason: concedeReason };
        return;
    }

    const words = fullResponse.split(/(\s+)/);
    for (const word of words) {
        yield word;
        await new Promise(resolve => setTimeout(resolve, 30));
    }

    await addDebateMessage(sessionId, "assistant", fullResponse);
}

export async function listDebateSessions(): Promise<DebateSession[]> {
    const list = await getDebatesList();
    const sessions: DebateSession[] = [];

    for (const item of list) {
        const session = await getDebateSession(item.id);
        if (session) {
            sessions.push(session);
        }
    }

    return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDebateSession(id: string): Promise<boolean> {
    const list = await getDebatesList();
    const filteredList = list.filter(item => item.id !== id);
    await db.set(DEBATE_LIST_KEY, filteredList);

    // Delete session
    await db.delete(`debate:session:${id}`);
    return true;
}

export async function surrenderDebate(sessionId: string): Promise<void> {
    const session = await getDebateSession(sessionId);
    if (session) {
        session.status = "user_surrendered";
        session.winner = "ai";
        await db.set(`debate:session:${sessionId}`, session);
    }
}

export async function* streamDebateAnalysis(sessionId: string): AsyncGenerator<
    { type: "phase"; value: string } | { type: "analysis"; data: DebateAnalysis },
    void,
    unknown
> {
    const session = await getDebateSession(sessionId);
    if (!session) {
        throw new Error("Debate session not found");
    }

    yield { type: "phase", value: "Gathering debate data..." };

    const userMessages = session.messages.filter(m => m.role === "user").map(m => m.content);
    const aiMessages = session.messages.filter(m => m.role === "assistant").map(m => m.content);

    yield { type: "phase", value: "Analyzing arguments..." };

    const analysisPrompt = `Tu es juge expert d’un débat terminé sur le sujet « ${session.topic} ».
Position de l’élève : ${session.position === "for" ? "pour" : "contre"} ; position de l’IA : ${session.position === "for" ? "contre" : "pour"}.
${session.status === "user_surrendered" ? "L’élève a abandonné le débat.\n" : ""}${session.status === "ai_conceded" ? "L’IA a concédé le débat faute d’arguments solides.\n" : ""}
Arguments de l’élève :
${userMessages.map((msg, i) => `${i + 1}. ${msg}`).join("\n\n")}
Arguments de l’IA :
${aiMessages.map((msg, i) => `${i + 1}. ${msg}`).join("\n\n")}
Donne une analyse complète sous la forme exacte de cet objet JSON, sans Markdown :
{
  "winner": "user",
  "reason": "raison de la victoire",
  "userStrengths": ["points forts de l’élève"],
  "aiStrengths": ["points forts de l’IA"],
  "userWeaknesses": ["points faibles de l’élève"],
  "aiWeaknesses": ["points faibles de l’IA"],
  "keyMoments": ["moments clés"],
  "overallAssessment": "bilan du débat"
}
Garde "winner" tel quel ("user", "ai" ou "draw"). Rédige toutes les autres valeurs en français, sans traductions anglaises ni termes techniques sur l’état du débat, en t’adressant à l’élève avec « tu » et en appelant l’IA « l’IA ».`;

    const messages = [
        { role: "system" as const, content: "Tu es juge de débat. Donne une analyse juste et équilibrée, uniquement en JSON valide." },
        { role: "user" as const, content: analysisPrompt }
    ];

    try {
        yield { type: "phase", value: "Consulting AI judge..." };

        const response = await llm.call(messages);
        const analysisText = toText(response).trim();

        yield { type: "phase", value: "Processing results..." };

        let jsonText = analysisText;
        const jsonMatch = analysisText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }

        const analysis: DebateAnalysis = JSON.parse(jsonText);

        if (!session.winner) {
            session.winner = analysis.winner;
            session.status = "completed";
            await db.set(`debate:session:${sessionId}`, session);
        }

        yield { type: "analysis", data: analysis };
    } catch (error) {
        console.error("[Debate Analysis] Error:", error);

        yield { type: "phase", value: "Generating fallback analysis..." };

        const fallbackAnalysis: DebateAnalysis = {
            winner: session.winner || "draw",
            reason: session.winner === "user" ? "Tes arguments ont été les plus solides." : session.winner === "ai" ? "Les arguments de l’IA ont été les plus solides." : "Les deux camps se sont équilibrés.",
            userStrengths: ["Tu as participé au débat", "Tu as présenté des arguments", "Tu as défendu ta position"],
            aiStrengths: ["L’IA a proposé des contre-arguments", "L’IA a contesté tes idées", "L’IA a raisonné avec logique"],
            userWeaknesses: [],
            aiWeaknesses: [],
            keyMoments: ["Les arguments d’ouverture", "Les réfutations clés", "Les derniers échanges"],
            overallAssessment: `Le débat a compté ${userMessages.length} échange(s). Le bilan détaillé n’a pas pu être généré, mais chaque camp a défendu sa position.`
        };

        yield { type: "analysis", data: fallbackAnalysis };
    }
}
