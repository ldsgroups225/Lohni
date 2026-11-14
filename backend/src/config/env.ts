import fs from 'node:fs'
import path from 'node:path'

// Containers get their settings as environment variables, without a .env file.
const envFile = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

export const config = {
  url: process.env.VITE_BACKEND_URL || '',
  timeout: Number(process.env.VITE_TIMEOUT || 90000),
  openrouter: process.env.OPENROUTER_API_KEY || '',
  openrouter_model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5,deepseek/deepseek-v4.1-flash-1017,particle-ai/particle-1:free,nvidia/nemotron-3.5-super-vl:free,nvidia/nemotron-3.5-lightning:free,openrouter/free',
  openrouter_embed_model: process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-large',
  transcription_model: process.env.TRANSCRIPTION_MODEL || 'openai/gpt-4o-mini-transcribe',
  temp: Number(process.env.LLM_TEMP || 1),
  max_tokens: Number(process.env.LLM_MAXTOK || 16384),
  port: Number(process.env.PORT || 5000),
  baseUrl: process.env.VITE_BACKEND_URL || 'http://localhost:5000',
  frontendUrl: process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
  tts_provider: process.env.TTS_PROVIDER || 'edge',
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  tts_voice_edge: process.env.TTS_VOICE_EDGE || 'fr-FR-DeniseNeural',
  tts_voice_alt_edge: process.env.TTS_VOICE_ALT_EDGE || 'fr-FR-HenriNeural',
  tts_model: process.env.TTS_MODEL || 'google/gemini-3.8-flash-lite-tts',
  tts_voice: process.env.TTS_VOICE || 'Kore',
  tts_voice_alt: process.env.TTS_VOICE_ALT || 'Charon',
}
