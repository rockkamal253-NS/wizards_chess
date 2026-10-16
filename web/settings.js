import { state } from './state.js';
import { sfx } from './audio.js';
import { dom } from './dom.js';

const STORAGE_KEY = 'wizards_chess_settings';

export function saveSettings() {
  try {
    if (typeof localStorage === 'undefined') return;
    const data = {
      aiDepth: state.aiDepth,
      humanColor: state.humanColor,
      shadowHigh: state.shadowHigh,
      muted: sfx.muted
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {
    // Gracefully ignore QuotaExceededError or security restrictions
  }
}

export function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    if ([0, 1, 2, 3].includes(parsed.aiDepth)) {
      state.aiDepth = parsed.aiDepth;
    }
    if (parsed.humanColor === 'w' || parsed.humanColor === 'b') {
      state.humanColor = parsed.humanColor;
    }
    if (typeof parsed.shadowHigh === 'boolean') {
      state.shadowHigh = parsed.shadowHigh;
    }
    if (typeof parsed.muted === 'boolean') {
      sfx.muted = parsed.muted;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

export function applyLoadedSettings() {
  document.querySelectorAll('#ai-group .md-chip').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.depth, 10) === state.aiDepth);
  });
  document.querySelectorAll('#side-group .md-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.side === state.humanColor);
  });
  if (state.humanColor === 'b') {
    state.camYaw = Math.PI;
    state.targetYaw = Math.PI;
  }
  if (dom.muteBtn) {
    dom.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  }
}
