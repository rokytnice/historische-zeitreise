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

    // Einen wiederverwendbaren Audio-Player erstellen
    this.audioPlayer = new Audio();

    this.overlay = document.getElementById('cinema-overlay');
    this.slidesContainer = document.getElementById('cinema-slides');
    this.progressBar = document.getElementById('cinema-progress-bar');
    this.counter = document.getElementById('cinema-counter');

    this._bindEvents();
  }

  static isSupported() {
    return true;
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
    this.audioPlayer.pause();
    this.audioPlayer.removeAttribute('src');

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

      const images = fact.imageBlobs || [fact.imageBlob];
      const validImages = images.filter(Boolean);
      log(`Cinema: Slide ${i} hat ${validImages.length} Bilder`);

      // Mehrere Bilder als überlagerte Schichten (Crossfade)
      const imagesHtml = validImages.length > 0
        ? validImages.map((src, j) =>
            `<img class="cinema-slide-image" data-img-index="${j}" src="${src}" alt="" style="${j === 0 ? 'opacity:1' : 'opacity:0'}">`
          ).join('')
        : `<div class="cinema-slide-placeholder"></div>`;

      slide.innerHTML = `
        ${imagesHtml}
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

    // Slide aktivieren
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

    // Text ausblenden wenn Audio startet
    const textOverlay = slide?.querySelector('.cinema-text-overlay');
    if (textOverlay) textOverlay.classList.add('audio-playing');

    // Bilder-Wechsel starten (Crossfade während Audio läuft)
    const imageRotation = this._startImageRotation(slide);

    // Audio abspielen
    if (fact.audioBuffer) {
      log('Cinema: Spiele generiertes Audio ab');
      await this._playAudioBuffer(fact.audioBuffer);
    } else {
      log('Cinema: Fallback auf Web Speech API');
      await this._speakFallback(fact.fact);
    }

    if (!this.isPlaying) return;

    // Bilder-Wechsel stoppen
    this._stopImageRotation(imageRotation);

    // Text wieder einblenden nach Audio
    if (textOverlay) textOverlay.classList.remove('audio-playing');

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

      // Wiederverwendbaren Player nutzen (bereits entsperrt)
      this.audioPlayer.volume = 1.0;
      this.audioPlayer.src = wavUrl;

      const cleanup = () => {
        URL.revokeObjectURL(wavUrl);
        this.audioPlayer.onended = null;
        this.audioPlayer.onerror = null;
      };

      this.audioPlayer.onended = () => {
        log('Cinema: Audio fertig abgespielt');
        cleanup();
        resolve();
      };

      this.audioPlayer.onerror = (e) => {
        log('Cinema: Audio-Fehler', e);
        cleanup();
        resolve();
      };

      this.audioPlayer.play().catch((err) => {
        log('Cinema: play() Fehler', err);
        cleanup();
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
        <button class="btn btn-secondary" id="cinema-exit-btn">Neue Zeitreise</button>
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

  _startImageRotation(slide) {
    if (!slide) return null;
    const images = slide.querySelectorAll('.cinema-slide-image');
    if (images.length <= 1) return null;

    let currentImg = 0;
    const interval = setInterval(() => {
      // Aktuelles Bild ausblenden
      images[currentImg].style.opacity = '0';
      // Nächstes Bild einblenden
      currentImg = (currentImg + 1) % images.length;
      images[currentImg].style.opacity = '1';
      log(`Cinema: Bild-Wechsel → ${currentImg + 1}/${images.length}`);
    }, 4000); // Alle 4 Sekunden wechseln

    return { interval, images };
  }

  _stopImageRotation(rotation) {
    if (!rotation) return;
    clearInterval(rotation.interval);
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
