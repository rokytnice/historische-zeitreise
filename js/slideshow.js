// slideshow.js - Audio-Slideshow mit Web Speech API

import { CONFIG, log } from './config.js';

export class Slideshow {
  constructor(facts, callbacks = {}) {
    this.facts = facts;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.onCardFocus = callbacks.onCardFocus || (() => {});
    this.onCardBlur = callbacks.onCardBlur || (() => {});
    this.onFinished = callbacks.onFinished || (() => {});
    this.onStateChange = callbacks.onStateChange || (() => {});
  }

  static isSupported() {
    return 'speechSynthesis' in window;
  }

  start() {
    if (!Slideshow.isSupported()) {
      log('Web Speech API nicht verfügbar');
      return;
    }
    this.isPlaying = true;
    this.currentIndex = 0;
    this.onStateChange('playing');
    this._playNext();
  }

  stop() {
    this.isPlaying = false;
    window.speechSynthesis.cancel();
    if (this.currentIndex < this.facts.length) {
      this.onCardBlur(this.facts[this.currentIndex].id);
    }
    this.onStateChange('stopped');
  }

  async _playNext() {
    if (!this.isPlaying || this.currentIndex >= this.facts.length) {
      this.isPlaying = false;
      this.onStateChange('finished');
      this.onFinished();
      return;
    }

    const fact = this.facts[this.currentIndex];
    log(`Slideshow: Karte ${fact.id} - Start`);

    // Karte hervorheben
    this.onCardFocus(fact.id);
    fact.audioStatus = 'speaking';

    // Fakt vorlesen
    await this._speak(fact.fact);
    fact.audioStatus = 'done';

    // 1.5 Sekunden Pause (Bild wirken lassen)
    await this._pause(CONFIG.CARD_PAUSE_MS);

    // Karte zurücksetzen
    this.onCardBlur(fact.id);

    // Nächste Karte
    this.currentIndex++;
    this._playNext();
  }

  _speak(text) {
    return new Promise((resolve) => {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = CONFIG.SPEECH_LANG;
      utterance.rate = CONFIG.SPEECH_RATE;

      utterance.onend = () => {
        log('Slideshow: Sprachausgabe beendet');
        resolve();
      };

      utterance.onerror = (e) => {
        log('Slideshow: Sprachfehler', e);
        resolve(); // Weiter zur nächsten Karte auch bei Fehler
      };

      // Chrome-Bug-Workaround: speechSynthesis pausiert nach ~15s
      this._chromeWorkaround();

      window.speechSynthesis.speak(utterance);
    });
  }

  _pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _chromeWorkaround() {
    // Chrome stoppt speechSynthesis nach ~15 Sekunden wenn nicht resumed
    if (this._resumeInterval) clearInterval(this._resumeInterval);
    this._resumeInterval = setInterval(() => {
      if (!this.isPlaying) {
        clearInterval(this._resumeInterval);
        return;
      }
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }
}
