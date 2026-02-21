// ui.js - DOM-Rendering und UI-Steuerung

import { log } from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

export function showSection(id) {
  $$('.section').forEach(s => s.classList.add('hidden'));
  $(`#${id}`).classList.remove('hidden');
}

export function setLoadingText(text) {
  $('#loading-text').textContent = text;
}

export function showLoading(text = 'Recherchiere historische Fakten...') {
  setLoadingText(text);
  $('#loading-section').classList.remove('hidden');
  $('#input-section').classList.add('hidden');
}

export function hideLoading() {
  $('#loading-section').classList.add('hidden');
}

export function showResults() {
  hideLoading();
  $('#results-section').classList.remove('hidden');
}

export function showError(message) {
  hideLoading();
  const el = $('#error-section');
  el.classList.remove('hidden');
  el.querySelector('.error-text').textContent = message;
}

export function hideError() {
  $('#error-section').classList.add('hidden');
}

export function showInput() {
  $$('.section').forEach(s => s.classList.add('hidden'));
  $('#input-section').classList.remove('hidden');
}

export function renderCards(facts) {
  const container = $('#cards-container');
  container.innerHTML = '';

  facts.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = `card-${item.id}`;
    card.innerHTML = `
      <div class="card-image-wrapper">
        <div class="card-image-placeholder">
          <div class="spinner-small"></div>
          <span>Bild wird generiert...</span>
        </div>
        <img class="card-image" alt="Historisches Bild" style="display:none">
      </div>
      <div class="card-body">
        <div class="card-number">${item.id}</div>
        <p class="card-fact">${escapeHtml(item.fact)}</p>
      </div>
      <div class="card-audio-indicator">
        <span class="audio-wave">
          <span></span><span></span><span></span><span></span><span></span>
        </span>
      </div>
    `;
    container.appendChild(card);
  });

  log(`UI: ${facts.length} Karten gerendert`);
}

export function updateCardImage(id, blobUrl) {
  const card = $(`#card-${id}`);
  if (!card) return;

  const img = card.querySelector('.card-image');
  const placeholder = card.querySelector('.card-image-placeholder');

  if (blobUrl) {
    img.src = blobUrl;
    img.onload = () => {
      placeholder.style.display = 'none';
      img.style.display = 'block';
      img.classList.add('fade-in');
    };
  } else {
    // Bild fehlgeschlagen
    placeholder.innerHTML = `
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m21 15-5-5L5 21"/>
      </svg>
      <span>Bild nicht verfügbar</span>
    `;
    placeholder.classList.add('placeholder-error');
  }
}

export function highlightCard(id) {
  $$('.card').forEach(c => c.classList.remove('card--active'));
  const card = $(`#card-${id}`);
  if (card) {
    card.classList.add('card--active');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function unhighlightCard(id) {
  const card = $(`#card-${id}`);
  if (card) card.classList.remove('card--active');
}

export function showPlayButton() {
  $('#play-btn').classList.remove('hidden');
}

export function hidePlayButton() {
  $('#play-btn').classList.add('hidden');
}

export function showRestartButton() {
  $('#restart-btn').classList.remove('hidden');
}

export function hideRestartButton() {
  $('#restart-btn').classList.add('hidden');
}

export function showStopButton() {
  $('#stop-btn').classList.remove('hidden');
}

export function hideStopButton() {
  $('#stop-btn').classList.add('hidden');
}

export function setImageProgress(done, total) {
  const el = $('#image-progress');
  if (el) {
    el.textContent = `Bilder: ${done}/${total}`;
    if (done >= total) {
      el.classList.add('complete');
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
