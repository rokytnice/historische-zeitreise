// config.js - API-Konfiguration und Konstanten

const STORAGE_KEY = 'timemachine_api_key';

export const CONFIG = {
  RESEARCH_MODEL: 'gemini-2.0-flash',
  IMAGE_MODEL: 'gemini-2.5-flash-image',
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  SPEECH_LANG: 'de-DE',
  SPEECH_RATE: 0.95,
  CARD_PAUSE_MS: 1500,
  MAX_FACTS: 3,
  DEBUG: true
};

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

export function log(...args) {
  if (CONFIG.DEBUG) console.debug('[TimeMachine]', ...args);
}
