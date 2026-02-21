// gemini-tts.js - Audio-Generierung via Gemini TTS

import { CONFIG, getApiKey, log } from './config.js';

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = 'Enceladus'; // Gut für Deutsch
const SAMPLE_RATE = 24000;

export async function generateAudio(text, retries = 1) {
  const apiKey = getApiKey();
  const url = `${CONFIG.API_BASE}/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

  log('TTS: Generiere Audio für:', text.substring(0, 60) + '...');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text }]
          }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: TTS_VOICE
                }
              }
            }
          }
        })
      });

      if (response.status === 429) {
        if (attempt < retries) {
          await sleep(Math.pow(2, attempt + 1) * 1000);
          continue;
        }
        log('TTS: Rate limited');
        return null;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || response.statusText);
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];

      for (const part of parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const audioBuffer = base64ToAudioBuffer(base64Data);
          log('TTS: Audio generiert, Bytes:', audioBuffer.byteLength);
          return audioBuffer;
        }
      }

      return null;

    } catch (err) {
      if (attempt < retries) {
        await sleep(1000);
        continue;
      }
      log('TTS: Fehler', err.message);
      return null;
    }
  }
  return null;
}

export async function generateAllAudio(facts, onAudioReady) {
  const promises = facts.map(async (item) => {
    const audioBuffer = await generateAudio(item.fact);
    item.audioBuffer = audioBuffer;
    if (onAudioReady) onAudioReady(item.id, audioBuffer);
    return item;
  });

  await Promise.allSettled(promises);
  return facts;
}

// PCM L16 (16-bit signed, 24kHz) zu WAV konvertieren und als Blob-URL zurückgeben
export function audioBufferToWavUrl(pcmBuffer) {
  if (!pcmBuffer) return null;

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.byteLength;

  // WAV Header (44 bytes)
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  // RIFF Header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt Chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // Chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data Chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM Daten direkt kopieren (Gemini liefert Little-Endian L16)
  const pcmBytes = new Uint8Array(pcmBuffer);
  const wavBytes = new Uint8Array(wavBuffer, 44);
  wavBytes.set(pcmBytes);

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function base64ToAudioBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
