// app.js - Hauptorchestrator

import { getApiKey, setApiKey, clearApiKey, log } from './config.js';
import { researchHistory } from './gemini-research.js';
import { generateAllImages } from './gemini-image.js';
import { Slideshow } from './slideshow.js';
import * as UI from './ui.js';

let timelineData = [];
let slideshow = null;
let imagesLoaded = 0;

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

    await startTimeTravel(date, location);
  });

  // Steuerung
  document.getElementById('play-btn').addEventListener('click', startSlideshow);
  document.getElementById('stop-btn').addEventListener('click', stopSlideshow);
  document.getElementById('restart-btn').addEventListener('click', startSlideshow);
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

  try {
    // Stufe 1: Recherche
    timelineData = await researchHistory(date, location);

    // Fakten sofort anzeigen
    UI.showResults();
    UI.renderCards(timelineData);

    // Stufe 2: Bilder parallel generieren
    setState('generating');
    UI.setImageProgress(0, timelineData.length);

    await generateAllImages(timelineData, (id, blob) => {
      imagesLoaded++;
      UI.updateCardImage(id, blob);
      UI.setImageProgress(imagesLoaded, timelineData.length);
    });

    setState('ready');
    UI.showPlayButton();

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

function startSlideshow() {
  setState('playing');

  slideshow = new Slideshow(timelineData, {
    onFinished: () => {
      setState('ready');
      UI.showPlayButton();
      document.getElementById('new-journey-btn').classList.remove('hidden');
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
