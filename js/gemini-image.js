// gemini-image.js - Stufe 2: Bildgenerierung (Gemini + Wikimedia Fallback)

import { CONFIG, getApiKey, log } from './config.js';

const IMAGES_PER_FACT = 3;

// Generiert mehrere Bilder pro Fakt (Gemini + Wikimedia Fallback)
export async function generateImagesForFact(promptText, factText = '') {
  // Stufe 2a: Gemini nur 1x testen ob verfügbar
  const geminiImage = await tryGeminiImage(promptText);
  if (geminiImage) {
    // Gemini funktioniert - alle 3 Bilder damit generieren
    const images = [geminiImage];
    const remaining = await Promise.all(
      Array.from({ length: IMAGES_PER_FACT - 1 }, () => tryGeminiImage(promptText))
    );
    images.push(...remaining.filter(Boolean));

    // Fehlende mit Wikimedia auffüllen
    if (images.length < IMAGES_PER_FACT) {
      const wikiImages = await tryWikimediaImages(factText || promptText, IMAGES_PER_FACT - images.length);
      images.push(...wikiImages);
    }
    return images;
  }

  // Stufe 2b: Gemini nicht verfügbar - direkt 3 Wikimedia-Bilder holen
  log('Stufe 2b: Fallback auf Wikimedia Commons (3 Bilder)...');
  const wikiImages = await tryWikimediaImages(factText || promptText, IMAGES_PER_FACT);
  return wikiImages.length > 0 ? wikiImages : [null];
}

async function tryGeminiImage(promptText, retries = 1) {
  const apiKey = getApiKey();
  const url = `${CONFIG.API_BASE}/models/${CONFIG.IMAGE_MODEL}:generateContent?key=${apiKey}`;

  log('Stufe 2a: Gemini Bildgenerierung für:', promptText.substring(0, 80) + '...');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate this image: ${promptText}`
            }]
          }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            temperature: 1.0
          }
        })
      });

      if (response.status === 429) {
        if (attempt < retries) {
          await sleep(Math.pow(2, attempt + 1) * 1000);
          continue;
        }
        log('Stufe 2a: Rate limited');
        return null;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error?.message || '';
        if (msg.includes('not available in your country') || msg.includes('not support')) {
          log('Stufe 2a: Gemini Bilder nicht verfügbar in dieser Region');
          return null; // Sofort zu Fallback
        }
        throw new Error(msg || response.statusText);
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData || part.inline_data) {
          const inlineData = part.inlineData || part.inline_data;
          log('Stufe 2a: Gemini Bild erfolgreich generiert');
          return `data:${inlineData.mimeType || inlineData.mime_type};base64,${inlineData.data}`;
        }
      }
      return null;

    } catch (err) {
      if (attempt < retries) {
        await sleep(1000);
        continue;
      }
      log('Stufe 2a: Gemini fehlgeschlagen', err.message);
      return null;
    }
  }
  return null;
}

async function tryWikimediaImages(searchText, count = 3) {
  const query = extractSearchQuery(searchText);
  log('Stufe 2b: Wikimedia-Suche:', query, `(${count} Bilder)`);

  try {
    const url = `https://commons.wikimedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: String(count + 10), // Mehr laden für Filter-Puffer
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      iiurlwidth: '800',
      format: 'json',
      origin: '*'
    });

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) return [];

    const candidates = Object.values(pages)
      .filter(p => {
        const title = (p.title || '').toLowerCase();
        return (title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.png'))
          && !title.includes('icon') && !title.includes('logo') && !title.includes('map');
      })
      .map(p => ({
        title: p.title,
        thumbUrl: p.imageinfo?.[0]?.thumburl,
        width: p.imageinfo?.[0]?.width || 0
      }))
      .filter(c => c.thumbUrl);

    const results = candidates.slice(0, count).map(c => c.thumbUrl);
    log(`Stufe 2b: ${results.length} Wikimedia Bilder gefunden`);
    return results;

  } catch (err) {
    log('Stufe 2b: Wikimedia Fehler', err.message);
    return [];
  }
}

function extractSearchQuery(text) {
  // Entferne häufige Stoppwörter und behalte relevante Begriffe
  // Wenn es ein englischer Prompt ist, extrahiere Schlüsselwörter
  // Wenn es ein deutscher Fakt ist, extrahiere Orte, Daten, Ereignisse

  // Versuche Jahreszahlen und Ortsnamen zu finden
  const years = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g) || [];
  const places = text.match(/\b[A-Z][a-zäöüß]+(?:\s+[A-Z][a-zäöüß]+)*/g) || [];

  // Kombiniere die wichtigsten Begriffe
  const keywords = [...new Set([...places.slice(0, 3), ...years.slice(0, 1)])];

  if (keywords.length >= 2) {
    return keywords.join(' ') + ' historical';
  }

  // Fallback: erste 5 signifikante Wörter
  const words = text.split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5)
    .join(' ');
  return words + ' historical photo';
}

export async function generateAllImages(facts, onImageReady) {
  // 3 Bilder pro Fakt parallel generieren
  const promises = facts.map(async (item) => {
    const images = await generateImagesForFact(item.imagePrompt, item.fact);
    item.imageBlobs = images; // Array von Bild-URLs
    item.imageBlob = images[0] || null; // Erstes Bild als Vorschau
    if (onImageReady) onImageReady(item.id, images);
    return item;
  });

  await Promise.allSettled(promises);
  return facts;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
