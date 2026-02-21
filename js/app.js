// app.js - Hauptorchestrator

import { getApiKey, setApiKey, clearApiKey, log } from './config.js';
import { researchHistory } from './gemini-research.js';
import { generateAllImages } from './gemini-image.js';
import { generateAllAudio } from './gemini-tts.js';
import { Slideshow } from './slideshow.js';
import * as UI from './ui.js';

let timelineData = [];
let slideshow = null;
let imagesLoaded = 0;
let audioLoaded = 0;

// App-Status: idle | researching | generating | ready | playing
let appState = 'idle';

function setState(state) {
  appState = state;
  log('App-Status:', state);
}

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
  checkApiKey();
  bindEvents();

  if (!Slideshow.isSupported()) {
    log('Web Speech API nicht unterstützt');
  }
});

function checkApiKey() {
  if (!getApiKey()) {
    document.getElementById('api-key-dialog').showModal();
  }
}

function bindEvents() {
  // API-Key Dialog
  const dialog = document.getElementById('api-key-dialog');
  dialog.querySelector('form').addEventListener('submit', (e) => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) {
      setApiKey(key);
      dialog.close();
    }
  });

  // Zeitreise-Formular
  document.getElementById('time-travel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('date-input').value.trim();
    const location = document.getElementById('location-input').value.trim();

    if (!date || !location) return;
    if (!getApiKey()) {
      dialog.showModal();
      return;
    }

    // Audio-Kontext sofort beim User-Klick entsperren (für Mobile)
    unlockAudio();
    await startTimeTravel(date, location);
  });

  // Steuerung
  document.getElementById('play-btn').addEventListener('click', startSlideshow);
  document.getElementById('new-journey-btn').addEventListener('click', resetApp);
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    UI.hideError();
    UI.showInput();
  });
}

async function startTimeTravel(date, location) {
  setState('researching');
  UI.hideError();
  UI.showLoading('Recherchiere historische Fakten...');
  timelineData = [];
  imagesLoaded = 0;
  audioLoaded = 0;

  try {
    // Stufe 1: Recherche
    timelineData = await researchHistory(date, location);

    // Medien generieren (Ladebildschirm bleibt sichtbar)
    setState('generating');
    UI.setLoadingText('Generiere Bilder und Audio...');

    const imagePromise = generateAllImages(timelineData, (id, images) => {
      imagesLoaded++;
      UI.setMediaProgress(imagesLoaded, audioLoaded, timelineData.length);
    });

    const audioPromise = generateAllAudio(timelineData, (id, buffer) => {
      audioLoaded++;
      UI.setMediaProgress(imagesLoaded, audioLoaded, timelineData.length);
    });

    await Promise.all([imagePromise, audioPromise]);

    // Ladebildschirm ausblenden und Slideshow starten
    UI.hideLoading();
    setState('ready');
    startSlideshow();

  } catch (err) {
    log('Fehler:', err);

    if (err.message === 'API_KEY_INVALID') {
      clearApiKey();
      UI.hideLoading();
      UI.showError('Der API-Key ist ungültig. Bitte erneut eingeben.');
      setTimeout(() => document.getElementById('api-key-dialog').showModal(), 1000);
      return;
    }

    if (err.message === 'RATE_LIMITED') {
      UI.showError('Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.');
      return;
    }

    UI.showError(err.message || 'Ein unerwarteter Fehler ist aufgetreten.');
  }
}

// Audio-Kontext entsperren (muss direkt im User-Click-Handler aufgerufen werden)
function unlockAudio() {
  try {
    const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    a.volume = 0.01;
    const p = a.play();
    if (p) p.catch(() => {});
    log('Audio-Kontext entsperrt');
  } catch (e) {}
}

function startSlideshow() {
  setState('playing');

  slideshow = new Slideshow(timelineData, {
    onFinished: () => {
      setState('idle');
      UI.hideLoading();
      UI.hideError();
      UI.showInput();
    },
    onStateChange: (state) => log('Cinema-Status:', state)
  });

  slideshow.start();
}

function resetApp() {
  if (slideshow) slideshow.stop();
  slideshow = null;
  timelineData = [];
  imagesLoaded = 0;
  setState('idle');

  // Alle Sections verstecken
  UI.hidePlayButton();
  UI.hideStopButton();
  UI.hideRestartButton();
  UI.hideError();
  UI.hideLoading();
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('new-journey-btn').classList.add('hidden');
  document.getElementById('cards-container').innerHTML = '';
  document.getElementById('image-progress').textContent = '';
  document.getElementById('image-progress').classList.remove('complete');

  // Eingabe anzeigen
  UI.showInput();
  document.getElementById('date-input').value = '';
  document.getElementById('location-input').value = '';
  document.getElementById('date-input').focus();
}
