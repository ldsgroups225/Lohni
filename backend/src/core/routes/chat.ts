import { handleAsk } from "../../lib/ai/ask";
import { parseMultipart, handleUpload } from "../../lib/parser/upload";
import {
  mkChat,
  getChat,
  addMsg,
  listChats,
  getMsgs,
} from "../../utils/chat/chat";
import { emitToAll } from "../../utils/chat/ws";

type UpFile = { path: string; filename: string; mimeType: string };

const chatSockets = new Map<string, Set<any>>();

export function chatRoutes(app: any) {
  app.ws("/ws/chat", (ws: any, req: any) => {
    const url = new URL(req.url, "http://localhost");
    const chatId = url.searchParams.get("chatId");
    if (!chatId) {
      return ws.close(1008, "chatId required");
    }

    const set = chatSockets.get(chatId) ?? new Set();
    chatSockets.set(chatId, set);
    set.add(ws);

    ws.on("close", (_code: number, _reason: string) => {
      set.delete(ws);
      if (set.size === 0) chatSockets.delete(chatId);
    });

    ws.send(JSON.stringify({ type: "ready", chatId }));
  });

  app.post("/chat", async (req: any, res: any, next: any) => {
    try {
      const ct = String(req.headers["content-type"] || "");
      const isMp = ct.includes("multipart/form-data");

      let q = "";
      let chatId: string | undefined;
      let files: UpFile[] = [];

      if (isMp) {
        const { q: mq, chatId: mcid, files: mf } = await parseMultipart(req);
        q = mq;
        chatId = mcid;
        files = mf || [];
        if (!q)
          return res.status(400).send({ error: "Écris ta question pour envoyer un fichier." });
      } else {
        q = req.body?.q || "";
        chatId = req.body?.chatId;
        if (!q) return res.status(400).send({ error: "Écris ta question." });
      }

      let chat = chatId ? await getChat(chatId) : undefined;
      if (!chat) chat = await mkChat(q);
      const id = chat.id;
      const ns = `chat:${id}`;

      res
        .status(202)
        .send({ ok: true, chatId: id, stream: `/ws/chat?chatId=${id}` });
      (async () => {
        try {
          if (isMp) {
            emitToAll(chatSockets.get(id), {
              type: "phase",
              value: "upload_start",
            });
            for (const f of files) {
              emitToAll(chatSockets.get(id), {
                type: "file",
                filename: f.filename,
                mime: f.mimeType,
              });
              await handleUpload({
                filePath: f.path,
                filename: f.filename,
                contentType: f.mimeType,
                namespace: ns,
              });
            }
            emitToAll(chatSockets.get(id), {
              type: "phase",
              value: "upload_done",
            });
          }

          await addMsg(id, { role: "user", content: q, at: Date.now() });
          emitToAll(chatSockets.get(id), {
            type: "phase",
            value: "generating",
          });

          let answer: any = "";

          const msgHistory = await getMsgs(id);
          const relevantHistory = msgHistory.slice(-20);

          answer = await handleAsk({
            q,
            namespace: ns,
            history: relevantHistory,
          });

          await addMsg(id, {
            role: "assistant",
            content: answer,
            at: Date.now(),
          });
          emitToAll(chatSockets.get(id), { type: "answer", answer });
          emitToAll(chatSockets.get(id), { type: "done" });
        } catch (err: any) {
          const msg = err?.message || "failed";
          const stack = err?.stack || String(err);
          console.error("[chat] err inner", { chatId: id, msg, stack });
          emitToAll(chatSockets.get(id), { type: "error", error: "Impossible de répondre pour l’instant. Réessaie." });
        }
      })().catch((e: any) => {
        console.error("[chat] err runner", e?.message || e);
      });
    } catch (e: any) {
      console.error("[chat] err outer", e?.message || e);
      next(e);
    }
  });

  app.get("/chats", async (_: any, res: any) => {
    const chats = await listChats();
    res.send({ ok: true, chats });
  });

  app.get("/chats/:id", async (req: any, res: any) => {
    const id = req.params.id;
    const chat = await getChat(id);
    if (!chat) {
      return res.status(404).send({ error: "Discussion introuvable." });
    }
    const messages = await getMsgs(id);
    res.send({ ok: true, chat, messages });
  });
}
