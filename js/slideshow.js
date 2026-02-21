// slideshow.js - Filmischer Cinema-Modus mit generiertem Audio

import { CONFIG, log } from './config.js';
import { audioBufferToWavUrl } from './gemini-tts.js';

export class Slideshow {
  constructor(facts, callbacks = {}) {
    this.facts = facts;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.onFinished = callbacks.onFinished || (() => {});
    this.onStateChange = callbacks.onStateChange || (() => {});
    this.currentAudio = null;

    this.overlay = document.getElementById('cinema-overlay');
    this.slidesContainer = document.getElementById('cinema-slides');
    this.progressBar = document.getElementById('cinema-progress-bar');
    this.counter = document.getElementById('cinema-counter');

    this._bindEvents();
  }

  static isSupported() {
    return true; // Audio-Files funktionieren überall
  }

  _bindEvents() {
    document.getElementById('cinema-close-btn').addEventListener('click', () => this.stop());
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.stop();
    };
  }

  start() {
    this.isPlaying = true;
    this.currentIndex = 0;
    this.onStateChange('playing');

    this._buildSlides();
    this.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._onKeyDown);

    setTimeout(() => this._playSlide(0), 800);
  }

  stop() {
    this.isPlaying = false;

    // Audio stoppen
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Fallback: Web Speech stoppen
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

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

    // Slide aktivieren mit Überblendung
    this.slidesContainer.querySelectorAll('.cinema-slide').forEach(s => s.classList.remove('active'));
    const slide = document.getElementById(`cinema-slide-${index}`);
    if (slide) {
      const textOverlay = slide.querySelector('.cinema-text-overlay');
      textOverlay.style.display = 'none';
      slide.offsetHeight;
      textOverlay.style.display = '';
      slide.classList.add('active');
    }

    this._updateProgress(index);

    // Überblendung abwarten
    await this._pause(1200);
    if (!this.isPlaying) return;

    // Audio abspielen (generiertes File oder Web Speech Fallback)
    if (fact.audioBuffer) {
      log('Cinema: Spiele generiertes Audio ab');
      await this._playAudioBuffer(fact.audioBuffer);
    } else {
      log('Cinema: Fallback auf Web Speech API');
      await this._speakFallback(fact.fact);
    }

    if (!this.isPlaying) return;

    // Pause - Bild wirken lassen
    await this._pause(CONFIG.CARD_PAUSE_MS);

    this._playSlide(index + 1);
  }

  _playAudioBuffer(pcmBuffer) {
    return new Promise((resolve) => {
      const wavUrl = audioBufferToWavUrl(pcmBuffer);
      if (!wavUrl) {
        resolve();
        return;
      }

      const audio = new Audio(wavUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(wavUrl);
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = (e) => {
        log('Cinema: Audio-Wiedergabe-Fehler', e);
        URL.revokeObjectURL(wavUrl);
        this.currentAudio = null;
        resolve();
      };

      audio.play().catch((err) => {
        log('Cinema: Audio play() Fehler', err);
        resolve();
      });
    });
  }

  async _speakFallback(text) {
    if (!('speechSynthesis' in window)) {
      await this._pause(4000);
      return;
    }

    const sentences = text
      .match(/[^.!?:]+[.!?:]+/g)
      ?.map(s => s.trim())
      ?.filter(s => s.length > 0) || [text];

    for (const sentence of sentences) {
      if (!this.isPlaying) return;
      await new Promise((resolve) => {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(sentence);
        utt.lang = CONFIG.SPEECH_LANG;
        utt.rate = CONFIG.SPEECH_RATE;
        utt.onend = resolve;
        utt.onerror = resolve;
        window.speechSynthesis.speak(utt);
        setTimeout(resolve, 20000);
      });
    }
  }

  _updateProgress(index) {
    const total = this.facts.length;
    this.counter.textContent = `${index + 1} / ${total}`;
    this.progressBar.style.width = `${((index + 1) / total) * 100}%`;
  }

  _showEndScreen() {
    this.isPlaying = false;

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

  _pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
