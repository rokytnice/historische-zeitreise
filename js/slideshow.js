// slideshow.js - Filmischer Cinema-Modus mit Web Speech API

import { CONFIG, log } from './config.js';

export class Slideshow {
  constructor(facts, callbacks = {}) {
    this.facts = facts;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.onFinished = callbacks.onFinished || (() => {});
    this.onStateChange = callbacks.onStateChange || (() => {});

    this.overlay = document.getElementById('cinema-overlay');
    this.slidesContainer = document.getElementById('cinema-slides');
    this.progressBar = document.getElementById('cinema-progress-bar');
    this.counter = document.getElementById('cinema-counter');

    this._bindEvents();
  }

  static isSupported() {
    return 'speechSynthesis' in window;
  }

  _bindEvents() {
    document.getElementById('cinema-close-btn').addEventListener('click', () => this.stop());
    // ESC zum Beenden
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.stop();
    };
  }

  start() {
    this.isPlaying = true;
    this.currentIndex = 0;
    this.onStateChange('playing');

    // Cinema-Overlay anzeigen
    this._buildSlides();
    this.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._onKeyDown);

    // Kurze Pause bevor es losgeht
    setTimeout(() => this._playSlide(0), 800);
  }

  stop() {
    this.isPlaying = false;
    window.speechSynthesis.cancel();
    if (this._resumeInterval) clearInterval(this._resumeInterval);

    // Cinema-Overlay verstecken
    this.overlay.classList.add('hidden');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this._onKeyDown);
    this.slidesContainer.innerHTML = '';

    this.onStateChange('stopped');
    this.onFinished();
  }

  _buildSlides() {
    this.slidesContainer.innerHTML = '';

    this.facts.forEach((fact, i) => {
      const slide = document.createElement('div');
      slide.className = 'cinema-slide';
      slide.id = `cinema-slide-${i}`;

      const hasImage = fact.imageBlob;

      slide.innerHTML = `
        ${hasImage
          ? `<img class="cinema-slide-image" src="${fact.imageBlob}" alt="">`
          : `<div class="cinema-slide-placeholder"></div>`
        }
        <div class="cinema-text-overlay">
          <div class="cinema-fact-number">${fact.id}</div>
          <p class="cinema-fact-text">${this._escapeHtml(fact.fact)}</p>
          <div class="cinema-audio-wave">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      `;

      this.slidesContainer.appendChild(slide);
    });

    // Update Counter
    this._updateProgress(0);
  }

  async _playSlide(index) {
    if (!this.isPlaying || index >= this.facts.length) {
      if (this.isPlaying) this._showEndScreen();
      return;
    }

    this.currentIndex = index;
    const fact = this.facts[index];

    log(`Cinema: Slide ${index + 1}/${this.facts.length}`);

    // Alle Slides deaktivieren, aktuellen aktivieren
    this.slidesContainer.querySelectorAll('.cinema-slide').forEach(s => s.classList.remove('active'));
    const slide = document.getElementById(`cinema-slide-${index}`);
    if (slide) {
      // Reset animations by forcing reflow
      const textOverlay = slide.querySelector('.cinema-text-overlay');
      textOverlay.style.display = 'none';
      slide.offsetHeight; // force reflow
      textOverlay.style.display = '';

      slide.classList.add('active');
    }

    this._updateProgress(index);

    // Warte kurz für die Überblendung
    await this._pause(1200);

    if (!this.isPlaying) return;

    // Fakt vorlesen
    if (Slideshow.isSupported()) {
      await this._speak(fact.fact);
    } else {
      // Ohne Sprache: Text einfach anzeigen lassen
      await this._pause(5000);
    }

    if (!this.isPlaying) return;

    // Pause - Bild wirken lassen
    await this._pause(CONFIG.CARD_PAUSE_MS);

    // Nächster Slide
    this._playSlide(index + 1);
  }

  _updateProgress(index) {
    const total = this.facts.length;
    this.counter.textContent = `${index + 1} / ${total}`;
    const percent = ((index + 1) / total) * 100;
    this.progressBar.style.width = `${percent}%`;
  }

  _showEndScreen() {
    this.isPlaying = false;
    if (this._resumeInterval) clearInterval(this._resumeInterval);

    const endScreen = document.createElement('div');
    endScreen.className = 'cinema-end';
    endScreen.innerHTML = `
      <h2>Zeitreise beendet</h2>
      <div class="cinema-end-buttons">
        <button class="btn btn-primary" id="cinema-replay-btn">Nochmal abspielen</button>
        <button class="btn btn-secondary" id="cinema-exit-btn">Beenden</button>
      </div>
    `;

    this.slidesContainer.appendChild(endScreen);

    endScreen.querySelector('#cinema-replay-btn').addEventListener('click', () => {
      endScreen.remove();
      this.start();
    });

    endScreen.querySelector('#cinema-exit-btn').addEventListener('click', () => {
      this.stop();
    });
  }

  _speak(text) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = CONFIG.SPEECH_LANG;
      utterance.rate = CONFIG.SPEECH_RATE;

      utterance.onend = () => {
        log('Cinema: Sprachausgabe beendet');
        resolve();
      };

      utterance.onerror = (e) => {
        log('Cinema: Sprachfehler', e);
        resolve();
      };

      this._chromeWorkaround();
      window.speechSynthesis.speak(utterance);
    });
  }

  _pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _chromeWorkaround() {
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

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
