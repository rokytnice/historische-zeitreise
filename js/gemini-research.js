// gemini-research.js - Stufe 1: Recherche + Prompt-Engineering

import { CONFIG, getApiKey, log } from './config.js';

const SYSTEM_PROMPT = `Du bist ein historischer Archivar und gleichzeitig ein Experte für Bild-KI-Prompts.

Recherchiere das angegebene Datum und den Ort mittels Google Search. Erstelle genau 3 historische Fakten.

Für JEDEN Fakt musst du EXAKT zwei Teile liefern:

FACT: Ein gut lesbarer, historisch korrekter Text auf Deutsch (2-3 Sätze, lebendig und anschaulich erzählt).

PROMPT: Eine extrem detaillierte Bildbeschreibung auf Englisch, optimiert für eine Bild-KI. Beschreibe:
- Kamerawinkel und -typ (z.B. "cinematic wide shot", "close-up portrait")
- Lichtstimmung (z.B. "golden hour lighting", "dramatic chiaroscuro")
- Historisch korrekte Kleidung und Architektur der Epoche
- Atmosphäre und Stimmung (z.B. "tense atmosphere", "joyful celebration")
- Kunststil (z.B. "oil painting style", "vintage photograph", "35mm film grain")
- KEINE Texte, Wasserzeichen oder Beschriftungen im Bild

Halte dich STRIKT an dieses Format. Genau 3 Fakten, nicht mehr, nicht weniger.
Jeder PROMPT muss eigenständig funktionieren ohne weiteren Kontext.

Formatbeispiel:
FACT: Am 9. November 1989 öffnete sich die Mauer an der Bornholmer Straße...
PROMPT: Cinematic wide shot of the Berlin Wall opening at night, November 1989, emotional crowds pushing through checkpoint, grainy 35mm film style, yellowish sodium street lamps casting warm pools of light, authentic late-1980s clothing with denim jackets and scarves, concrete wall with graffiti, atmosphere of overwhelming joy and disbelief, photojournalistic composition`;

export async function researchHistory(date, location) {
  const apiKey = getApiKey();
  const url = `${CONFIG.API_BASE}/models/${CONFIG.RESEARCH_MODEL}:generateContent?key=${apiKey}`;

  const userPrompt = `Datum: ${date}\nOrt: ${location}\n\nRecherchiere dieses Datum und diesen Ort und erstelle 3 historische Fakten im vorgegebenen Format.`;

  log('Stufe 1: Sende Recherche-Anfrage...', { date, location });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [{
        parts: [{ text: userPrompt }]
      }],
      tools: [{
        google_search: {}
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const errMsg = err.error?.message || '';
    if (response.status === 401 || response.status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED')) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`Recherche fehlgeschlagen: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  log('Stufe 1: Rohantwort erhalten', data);

  const text = data?.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('\n') || '';

  if (!text) {
    throw new Error('Keine Antwort vom Recherche-Modell erhalten.');
  }

  const facts = parseResponse(text);
  log('Stufe 1: Geparste Fakten', facts);

  if (facts.length === 0) {
    throw new Error('Konnte keine historischen Fakten extrahieren.');
  }

  return facts;
}

function parseResponse(text) {
  const facts = [];
  // Split by FACT: markers
  const blocks = text.split(/(?=FACT:)/i);

  for (const block of blocks) {
    const factMatch = block.match(/FACT:\s*(.+?)(?=PROMPT:|$)/is);
    const promptMatch = block.match(/PROMPT:\s*(.+?)$/is);

    if (factMatch && factMatch[1].trim().length > 10) {
      const fact = factMatch[1].trim();
      const imagePrompt = promptMatch
        ? promptMatch[1].trim()
        : deriveFallbackPrompt(fact);

      facts.push({
        id: facts.length + 1,
        fact,
        imagePrompt,
        imageBlob: null,
        audioStatus: 'pending'
      });
    }
  }

  return facts.slice(0, CONFIG.MAX_FACTS);
}

function deriveFallbackPrompt(factText) {
  // Legacy-Modus: einfacher englischer Prompt aus deutschem Fakt
  log('Fallback-Prompt generiert für:', factText.substring(0, 50));
  return `Historical illustration depicting: ${factText.substring(0, 200)}. Style: detailed oil painting, historically accurate architecture and clothing, dramatic lighting, cinematic composition, no text or watermarks`;
}
