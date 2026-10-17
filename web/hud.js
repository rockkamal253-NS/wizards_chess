import { state } from './state.js';
import { dom } from './dom.js';
import { sfx } from './audio.js';
import { FILES } from './board.js';
import { saveSettings } from './settings.js';
import { VALS, formatClock } from './match.js';

const SYMBOLS_W = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };
const SYMBOLS_B = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

// ============================================================================
// HUD DISPLAY, MODALS & TELEMETRY
// ============================================================================

export function updateHUD() {
  const statusEl = dom.statusText;
  const badgeEl = dom.turnBadge;
  const dotEl = dom.turnDot;
  const modal = dom.endModal;

  const isWhiteTurn = state.game.turn() === 'w';
  if (dom.cardWhite) dom.cardWhite.classList.toggle('active-turn', isWhiteTurn);
  if (dom.cardBlack) dom.cardBlack.classList.toggle('active-turn', !isWhiteTurn);
  if (badgeEl) badgeEl.classList.toggle('in-check', state.game.in_check());

  if (state.matchResult) {
    if (statusEl) statusEl.textContent = state.matchResult.status;
    if (dom.modalTitle) dom.modalTitle.textContent = state.matchResult.title;
    if (dom.modalSub) dom.modalSub.textContent = state.matchResult.sub;
    if (modal) modal.classList.add('visible');
  } else if (state.game.in_checkmate()) {
    const winner = isWhiteTurn ? 'OBSIDIAN GUARD' : 'MARBLE ORDER';
    if (statusEl) statusEl.textContent = `CHECKMATE — ${winner} WINS`;
    if (dom.modalTitle) dom.modalTitle.textContent = 'CHECKMATE';
    if (dom.modalSub) dom.modalSub.textContent = `The ${winner} triumphs in the Cathedral Sanctuary!`;
    if (modal) modal.classList.add('visible');
  } else if (state.game.in_draw()) {
    let why = 'DRAW';
    let sub = 'Neither order could claim the sanctuary.';
    if (state.game.in_stalemate()) {
      why = 'DRAW BY STALEMATE';
      sub = 'The side to move has no legal moves, yet is not in check.';
    } else if (state.game.insufficient_material()) {
      why = 'DRAW BY INSUFFICIENT MATERIAL';
      sub = 'Neither side has enough force to deliver checkmate.';
    } else if (state.game.in_threefold_repetition()) {
      why = 'DRAW BY REPETITION';
      sub = 'The same position occurred three times.';
    } else {
      why = 'DRAW BY FIFTY-MOVE RULE';
      sub = 'Fifty moves passed without a capture or pawn move.';
    }
    if (statusEl) statusEl.textContent = why;
    if (dom.modalTitle) dom.modalTitle.textContent = 'MATCH DRAWN';
    if (dom.modalSub) dom.modalSub.textContent = sub;
    if (modal) modal.classList.add('visible');
  } else {
    if (modal) modal.classList.remove('visible');
    const side = isWhiteTurn ? 'MARBLE ORDER (WHITE)' : 'OBSIDIAN GUARD (BLACK)';
    const chk = state.game.in_check() ? ' • CHECK!' : '';
    if (statusEl) statusEl.textContent = `${side}${chk}`;
  }

  if (dotEl) {
    dotEl.style.background = isWhiteTurn ? '#EDE8DF' : '#14121E';
    dotEl.style.boxShadow = isWhiteTurn
      ? '0 0 10px rgba(255,255,255,0.85)'
      : '0 0 10px rgba(180,40,60,0.85)';
  }

  // Material and captured piece counters
  const curCounts = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const maxCounts = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  let whiteMat = 0;
  let blackMat = 0;

  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.game.get(FILES[f] + r);
      if (p) {
        if (p.color === 'w') {
          curCounts[p.type] = (curCounts[p.type] || 0) + 1;
          whiteMat += VALS[p.type];
        } else {
          blackMat += VALS[p.type];
        }
      }
    }
  }

  const whiteCaptured = [];
  const blackCaptured = [];
  ['q', 'r', 'b', 'n', 'p'].forEach(t => {
    const lostWhite = Math.max(0, maxCounts[t] - (curCounts[t] || 0));
    for (let i = 0; i < lostWhite; i++) whiteCaptured.push(SYMBOLS_W[t]);

    let blackRemaining = 0;
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = state.game.get(FILES[f] + r);
        if (p && p.color === 'b' && p.type === t) blackRemaining++;
      }
    }
    const lostBlack = Math.max(0, maxCounts[t] - blackRemaining);
    for (let i = 0; i < lostBlack; i++) blackCaptured.push(SYMBOLS_B[t]);
  });

  if (dom.capWhite) dom.capWhite.textContent = whiteCaptured.join(' ');
  if (dom.capBlack) dom.capBlack.textContent = blackCaptured.join(' ');

  const matDiff = whiteMat - blackMat;
  if (dom.advWhite) dom.advWhite.textContent = matDiff > 0 ? `+${matDiff}` : '';
  if (dom.advBlack) dom.advBlack.textContent = matDiff < 0 ? `+${Math.abs(matDiff)}` : '';

  if (dom.evalFill) {
    const pct = Math.max(5, Math.min(95, 50 + matDiff * 4));
    dom.evalFill.style.height = `${pct}%`;
  }

  // Move Chronicle Ledger
  const history = state.game.history();
  if (dom.moveCount) dom.moveCount.textContent = `${history.length} ply`;
  if (dom.ledgerList) {
    let ledgerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const wMove = history[i] || '';
      const bMove = history[i + 1] || '';
      const wActive = state.replayPly === i ? 'active-ply' : '';
      const bActive = state.replayPly === i + 1 ? 'active-ply' : '';
      ledgerHTML += `
        <div class="ledger-row">
          <span class="ledger-num">${moveNum}.</span>
          <span class="ledger-san ${wActive}" data-ply="${i}">${wMove}</span>
          <span class="ledger-san ${bActive}" data-ply="${i + 1}">${bMove}</span>
        </div>`;
    }
    dom.ledgerList.innerHTML = ledgerHTML;
    if (state.replayPly === null) {
      dom.ledgerList.scrollTop = dom.ledgerList.scrollHeight;
    }
  }

  updateClockUI();
}

export function updateClockUI() {
  if (!dom.clockWhite || !dom.clockBlack) return;
  if (state.timeControl <= 0) {
    dom.clockWhite.style.display = 'none';
    dom.clockBlack.style.display = 'none';
    return;
  }
  dom.clockWhite.style.display = 'inline-block';
  dom.clockBlack.style.display = 'inline-block';
  dom.clockWhite.textContent = formatClock(state.clockWhite);
  dom.clockBlack.textContent = formatClock(state.clockBlack);
  dom.clockWhite.classList.toggle('low-time', state.clockWhite <= 30 && state.clockWhite > 0);
  dom.clockBlack.classList.toggle('low-time', state.clockBlack <= 30 && state.clockBlack > 0);
}

export function closeModal() {
  if (dom.endModal) dom.endModal.classList.remove('visible');
}

export function applyShadowQuality() {
  if (!state.sunLight) return;
  const size = state.shadowHigh ? 4096 : 1536;
  state.sunLight.shadow.mapSize.set(size, size);
  if (state.sunLight.shadow.map) {
    state.sunLight.shadow.map.dispose();
    state.sunLight.shadow.map = null;
  }
  if (dom.qualityBtn) dom.qualityBtn.textContent = `Shadows: ${state.shadowHigh ? 'High' : 'Low'}`;
}

export function toggleQuality() {
  state.shadowHigh = !state.shadowHigh;
  applyShadowQuality();
  saveSettings();
}

export function toggleAudio() {
  sfx.muted = !sfx.muted;
  if (dom.muteBtn) dom.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  saveSettings();
}

export function toggleFull() {
  if (window.pywebview && window.pywebview.api) {
    window.pywebview.api.toggle_fullscreen();
  } else if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

export function openIoModal() {
  if (dom.ioTextarea) {
    dom.ioTextarea.value = state.game.fen();
  }
  if (dom.ioModal) {
    dom.ioModal.classList.add('visible');
  }
}

export function closeIoModal() {
  if (dom.ioModal) {
    dom.ioModal.classList.remove('visible');
  }
}
