import { transcribeAudio } from "../../services/transcriber";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Busboy from 'busboy';

// OpenRouter rejects multipart transcription uploads above 25 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type AudioUpload = { path: string; mimeType: string; truncated: boolean };

// Audio goes to the OS temp dir, not storage/uploads, which is served publicly.
function parseAudioUpload(req: any): Promise<AudioUpload | null> {
    return new Promise((resolve, reject) => {
        const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_AUDIO_BYTES } });
        let upload: AudioUpload | null = null;
        let writing: Promise<void> = Promise.resolve();

        bb.on('file', (_name, file, info: any) => {
            const ext = path.extname(info?.filename || '').replace(/[^.\w]/g, '') || '.webm';
            const current: AudioUpload = { path: path.join(os.tmpdir(), `lohni-audio-${crypto.randomUUID()}${ext}`), mimeType: info?.mimeType || 'audio/webm', truncated: false };
            upload = current;
            const out = fs.createWriteStream(current.path);
            writing = new Promise((done, fail) => { out.on('finish', done); out.on('error', fail); file.on('error', fail); });
            file.on('limit', () => { current.truncated = true; });
            file.pipe(out);
        });
        bb.on('error', reject);
        bb.on('finish', () => { writing.then(() => resolve(upload), reject); });
        req.pipe(bb);
    });
}

export function transcriberRoutes(app: any) {
    app.post("/transcriber", async (req: any, res: any) => {
        if (!String(req.headers['content-type'] || '').includes('multipart/form-data')) {
            return res.status(400).json({ ok: false, error: 'Envoie un fichier audio.' });
        }

        let upload: AudioUpload | null = null;
        try {
            upload = await parseAudioUpload(req);
            if (!upload) return res.status(400).json({ ok: false, error: 'Aucun fichier audio reçu.' });
            if (upload.truncated) return res.status(413).json({ ok: false, error: 'L’enregistrement dépasse 25 Mo. Raccourcis-le et réessaie.' });
            if (!upload.mimeType.startsWith('audio/') && !upload.mimeType.startsWith('video/')) {
                return res.status(400).json({ ok: false, error: 'Le fichier doit être un enregistrement audio ou vidéo.' });
            }

            const result = await transcribeAudio(upload.path);
            res.json({ ok: true, transcription: result.text, studyMaterials: result.studyMaterials });
        } catch (error: any) {
            console.error('Transcription route error:', error);
            res.status(500).json({ ok: false, error: error?.message?.startsWith('La transcription') ? error.message : 'La transcription a échoué. Réessaie dans un instant.' });
        } finally {
            if (upload) fs.promises.rm(upload.path, { force: true }).catch(() => {});
        }
    });
}
