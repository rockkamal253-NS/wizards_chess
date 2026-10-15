import { state } from './state.js';
import { dom } from './dom.js';
import { sfx } from './audio.js';
import { FILES, syncBoardFull, rebuildTacticalMarkers } from './board.js';
import { scene } from './materials.js';
import { triggerAI } from './input.js';

const SYMBOLS_W = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };
const SYMBOLS_B = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function updateHUD() {
  const statusEl = dom.statusText;
  const badgeEl = dom.turnBadge;
  const dotEl = dom.turnDot;
  const modal = dom.endModal;

  const isWhiteTurn = state.game.turn() === 'w';
  if (dom.cardWhite) dom.cardWhite.classList.toggle('active-turn', isWhiteTurn);
  if (dom.cardBlack) dom.cardBlack.classList.toggle('active-turn', !isWhiteTurn);
  if (badgeEl) badgeEl.classList.toggle('in-check', state.game.in_check());

  if (state.game.in_checkmate()) {
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
    if (dotEl) dotEl.style.background = isWhiteTurn ? '#F2C96D' : '#FF4D64';
  }

  // Material Advantage & Captured Trays
  const hist = state.game.history({ verbose: true });
  const capByWhite = [];
  const capByBlack = [];
  hist.forEach(m => {
    if (m.captured) {
      if (m.color === 'w') capByWhite.push(SYMBOLS_B[m.captured] || '');
      else capByBlack.push(SYMBOLS_W[m.captured] || '');
    }
  });
  if (dom.capWhite) dom.capWhite.textContent = capByWhite.length ? capByWhite.join(' ') : '—';
  if (dom.capBlack) dom.capBlack.textContent = capByBlack.length ? capByBlack.join(' ') : '—';

  let wMat = 0, bMat = 0;
  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.game.get(FILES[f] + r);
      if (p) {
        if (p.color === 'w') wMat += VALS[p.type];
        else bMat += VALS[p.type];
      }
    }
  }
  const diff = wMat - bMat;
  if (dom.advWhite) dom.advWhite.textContent = diff >= 0 ? `+${diff}` : `${diff}`;
  if (dom.advBlack) dom.advBlack.textContent = diff <= 0 ? `+${-diff}` : `${-diff}`;
  const pct = Math.max(10, Math.min(90, 50 + diff * 4));
  if (dom.evalFill) dom.evalFill.style.width = `${pct}%`;

  // 2-Column Move Ledger
  const ledger = dom.ledgerList;
  if (dom.moveCount) dom.moveCount.textContent = `Turn ${Math.floor(hist.length / 2) + 1}`;
  if (ledger) {
    if (hist.length === 0) {
      ledger.innerHTML = '<div style="color:var(--md-muted); font-size:0.72rem;">Click any Marble piece or square to begin.</div>';
    } else {
      let html = '';
      for (let i = 0; i < hist.length; i += 2) {
        const wSan = hist[i].san;
        const bSan = hist[i + 1] ? hist[i + 1].san : '';
        html += `<div class="ledger-row"><span>${(i / 2) + 1}.</span><span>${wSan}</span><span>${bSan}</span></div>`;
      }
      ledger.innerHTML = html;
      ledger.scrollTop = ledger.scrollHeight;
    }
  }
}

export function clearSelection() {
  state.lastMove = null;
  state.selectedSq = null;
  state.validMoves = [];
  state.hintMove = null;
  state.pendingPromotion = null;
  if (dom.promoModal) dom.promoModal.classList.remove('visible');
}

export function undoMove() {
  if (state.isAnimating || state.game.history().length === 0) return;
  state.gen++; // invalidates any in-flight AI / hint result
  state.game.undo();
  if (state.aiDepth > 0 && state.game.turn() !== state.humanColor && state.game.history().length > 0) {
    state.game.undo();
  }
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
  triggerAI(); // no-op unless it is the AI's turn
}

export function resetGame() {
  if (state.isAnimating) return;
  state.gen++;
  state.game.reset();
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
  triggerAI();
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
}

export function toggleAudio() {
  sfx.muted = !sfx.muted;
  if (dom.muteBtn) dom.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
}

export function setSide(color) {
  if (state.isAnimating) return;
  state.humanColor = color;
  document.querySelectorAll('#side-group .md-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.side === color);
  });
  const turn = 2 * Math.PI;
  state.targetYaw = Math.round(state.targetYaw / turn) * turn + (color === 'b' ? Math.PI : 0);
  resetGame();
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
