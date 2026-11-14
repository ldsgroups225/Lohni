import {
    createDebateSession,
    getDebateSession,
    listDebateSessions,
    deleteDebateSession,
    surrenderDebate,
    runArgueTurn,
    runAnalysis,
} from "../../services/debate";
import { createTaskRegistry } from "../../utils/tasks/registry";

// One task per argue turn or analysis; the screen follows it on /ws/debate?taskId=.
const tasks = createTaskRegistry();

export function debateRoutes(app: any) {
    app.ws("/ws/debate", (ws: any, req: any) => {
        const taskId = new URL(req.url, "http://localhost").searchParams.get("taskId");
        if (!taskId) return ws.close(1008, "taskId required");
        if (!tasks.subscribe(taskId, ws)) {
            try { ws.send(JSON.stringify({ type: "error", error: "Cette réponse n’est plus disponible. Réessaie." })); } catch { }
            ws.close(1008, "unknown taskId");
        }
    });

    app.delete("/debate/tasks/:taskId", (req: any, res: any) => {
        if (tasks.cancel(req.params.taskId, req.headers?.["x-device-id"]) === "forbidden") {
            return res.status(403).json({ ok: false, error: "Cette réponse appartient à un autre appareil." });
        }
        res.json({ ok: true });
    });

    app.post("/debate/start", async (req: any, res: any) => {
        try {
            const { topic, position } = req.body;

            if (typeof topic !== 'string' || !topic.trim()) {
                return res.status(400).json({
                    ok: false,
                    error: "Indique le sujet du débat.",
                });
            }

            if (!position || !["for", "against"].includes(position)) {
                return res.status(400).json({
                    ok: false,
                    error: "La position doit être « pour » ou « contre ».",
                });
            }

            const session = await createDebateSession(topic.trim(), position);

            res.json({
                ok: true,
                debateId: session.id,
                session: {
                    id: session.id,
                    topic: session.topic,
                    position: session.position,
                    createdAt: session.createdAt,
                },
            });
        } catch (error: any) {
            console.error("Error starting debate:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible de lancer le débat. Réessaie.",
            });
        }
    });

    app.post("/debate/:debateId/argue", async (req: any, res: any) => {
        try {
            const { debateId } = req.params;
            const { argument } = req.body;

            if (typeof argument !== 'string' || !argument.trim()) {
                return res.status(400).json({
                    ok: false,
                    error: "Écris ton argument.",
                });
            }

            const session = await getDebateSession(debateId);
            if (!session) {
                return res.status(404).json({
                    ok: false,
                    error: "Débat introuvable.",
                });
            }

            const taskId = tasks.start({
                owner: req.headers?.["x-device-id"],
                startOn: "subscribe",
                run: (ctx) => runArgueTurn(debateId, argument.trim(), ctx),
            });
            res.status(202).json({ ok: true, taskId, stream: `/ws/debate?taskId=${taskId}` });
        } catch (error: any) {
            console.error("Error in debate argue:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible de traiter ton argument. Réessaie.",
            });
        }
    });

    app.get("/debate/:debateId", async (req: any, res: any) => {
        try {
            const { debateId } = req.params;
            const session = await getDebateSession(debateId);

            if (!session) {
                return res.status(404).json({
                    ok: false,
                    error: "Débat introuvable.",
                });
            }

            res.json({
                ok: true,
                session,
            });
        } catch (error: any) {
            console.error("Error getting debate:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible de charger le débat. Réessaie.",
            });
        }
    });

    app.get("/debates", async (_req: any, res: any) => {
        try {
            const sessions = await listDebateSessions();
            res.json({
                ok: true,
                debates: sessions.map((s) => ({
                    id: s.id,
                    topic: s.topic,
                    position: s.position,
                    messageCount: s.messages.length,
                    createdAt: s.createdAt,
                })),
            });
        } catch (error: any) {
            console.error("Error listing debates:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible de charger les débats. Réessaie.",
            });
        }
    });

    app.delete("/debate/:debateId", async (req: any, res: any) => {
        try {
            const { debateId } = req.params;
            const deleted = await deleteDebateSession(debateId);

            if (!deleted) {
                return res.status(404).json({
                    ok: false,
                    error: "Débat introuvable.",
                });
            }

            res.json({
                ok: true,
                message: "Débat supprimé.",
            });
        } catch (error: any) {
            console.error("Error deleting debate:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible de supprimer le débat. Réessaie.",
            });
        }
    });

    app.post("/debate/:debateId/surrender", async (req: any, res: any) => {
        try {
            const { debateId } = req.params;
            const session = await getDebateSession(debateId);

            if (!session) {
                return res.status(404).json({
                    ok: false,
                    error: "Débat introuvable.",
                });
            }

            await surrenderDebate(debateId);

            res.json({
                ok: true,
                message: "Débat abandonné.",
            });
        } catch (error: any) {
            console.error("Error surrendering debate:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible d’abandonner le débat. Réessaie.",
            });
        }
    });

    app.post("/debate/:debateId/analyze", async (req: any, res: any) => {
        try {
            const { debateId } = req.params;
            const session = await getDebateSession(debateId);

            if (!session) {
                return res.status(404).json({
                    ok: false,
                    error: "Débat introuvable.",
                });
            }

            const taskId = tasks.start({
                owner: req.headers?.["x-device-id"],
                startOn: "subscribe",
                run: (ctx) => runAnalysis(debateId, ctx),
            });
            res.status(202).json({ ok: true, taskId, stream: `/ws/debate?taskId=${taskId}` });
        } catch (error: any) {
            console.error("Error analyzing debate:", error);
            res.status(500).json({
                ok: false,
                error: "Impossible d’analyser le débat. Réessaie.",
            });
        }
    });
}
