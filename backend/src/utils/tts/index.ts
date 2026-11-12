import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { EdgeTTS } from 'node-edge-tts'
import { config } from '../../config/env'
import { requestOpenRouterSpeech } from './openrouter'

export type TSeg = { text: string; voice?: string }
export type TSay = (segs: TSeg[], dir: string, base: string, emit?: (m: any) => void) => Promise<string>

function ff(dir: string, parts: string[], out: string, emit?: (m: any) => void) {
  return new Promise<string>((res, rej) => {
    const list = path.join(dir, 'list.txt')
    const listContent = parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(list, listContent)
    
    const bin = config.ffmpeg || 'ffmpeg'
    
    const p = spawn(bin, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '192k', out], { stdio: 'pipe' })
    
    p.stderr.on('data', d => {
      const msg = String(d)
      emit?.({ type: 'ffmpeg', data: msg })
    })
    
    p.on('close', c => {
      if (c === 0) {
        res(out)
      } else {
        rej(new Error('ffmpeg_failed'))
      }
    })
    
    p.on('error', err => {
      rej(err)
    })
  })
}

async function synth_edge(segs: TSeg[], dir: string, base: string, emit?: (m: any) => void) {
  const v0 = config.tts_voice_edge || 'fr-FR-DeniseNeural'
  const v1 = config.tts_voice_alt_edge || 'fr-FR-HenriNeural'
  
  const files: string[] = []

  async function convertSegmentWithRetry(seg: TSeg, voice: string, outputFile: string, segmentIndex: number, maxRetries = 3) {
    let lastError: any = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tts = new EdgeTTS({
          voice: voice,
          lang: voice.split('-').slice(0, 2).join('-'),
          outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
          timeout: 15000
        })
        
        await tts.ttsPromise(seg.text, outputFile)
        
        const stats = fs.statSync(outputFile)
        if (stats.size === 0) {
          throw new Error('Generated file is empty')
        }
        
        return
        
      } catch (err: any) {
        lastError = err
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * 2 ** (attempt - 1), 5000) // Exponential backoff: 1s, 2s, 4s (max 5s)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    throw new Error(`Failed to convert segment ${segmentIndex + 1} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`)
  }

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const v = s.voice || (i % 2 ? v1 : v0)
    const f = path.join(dir, `${base}.${i}.mp3`)
    
    await convertSegmentWithRetry(s, v, f, i)
    
    files.push(f)
    emit?.({ type: 'audio_progress', i, len: segs.length })
  }

  const out = path.join(dir, `${base}.mp3`)
  const result = await ff(dir, files, out, emit)
  return result
}

async function synth_openrouter(segs: TSeg[], dir: string, base: string, emit?: (m: any) => void) {
  if (!config.openrouter) throw new Error('openrouter_api_key_missing')
  const files: string[] = []

  for (let i = 0; i < segs.length; i++) {
    const voice = i % 2 ? config.tts_voice_alt : config.tts_voice
    const wav = await requestOpenRouterSpeech(segs[i].text, { apiKey: config.openrouter, model: config.tts_model, voice })
    const f = path.join(dir, `${base}.${i}.wav`)
    await fs.promises.writeFile(f, wav)
    files.push(f)
    emit?.({ type: 'audio_progress', i, len: segs.length })
  }

  return ff(dir, files, path.join(dir, `${base}.mp3`), emit)
}

export const tts: TSay = async (segs, dir, base, emit) => {
  if (config.tts_provider === 'openrouter') return synth_openrouter(segs, dir, base, emit)
  try {
    return await synth_edge(segs, dir, base, emit)
  } catch (error) {
    // Edge is free but sometimes refuses (403); OpenRouter is the paid fallback when a key is set.
    if (!config.openrouter) throw error
    console.warn('[tts] Edge indisponible, repli sur OpenRouter :', (error as Error)?.message)
    return synth_openrouter(segs, dir, base, emit)
  }
}
