import { state } from './state.js';
import { dom } from './dom.js';
import { sfx } from './audio.js';
import { FILES, syncBoardFull, rebuildTacticalMarkers } from './board.js';
import { scene } from './materials.js';
import { triggerAI } from './input.js';
import { showToast } from './toast.js';
import { saveSettings } from './settings.js';

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
    if (dotEl) dotEl.style.background = isWhiteTurn ? '#F2C96D' : '#FF4D64';
  }

  if (state.replayPly !== null) {
    const replayText = state.replayPly === -1 ? 'START' : `PLY ${state.replayPly + 1}`;
    if (statusEl) statusEl.textContent = `REPLAY (${replayText}) • Click board or ➔ to resume live`;
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
  if (dom.moveCount) {
    if (state.replayPly !== null) {
      dom.moveCount.textContent = `Replay (${state.replayPly === -1 ? 'Start' : state.replayPly + 1}/${hist.length})`;
    } else {
      dom.moveCount.textContent = `Turn ${Math.floor(hist.length / 2) + 1}`;
    }
  }
  if (ledger) {
    if (hist.length === 0) {
      ledger.innerHTML = '<div style="color:var(--md-muted); font-size:0.72rem;">Click any Marble piece or square to begin.</div>';
    } else {
      let html = '';
      const activePly = state.replayPly !== null ? state.replayPly : (hist.length - 1);
      for (let i = 0; i < hist.length; i += 2) {
        const wSan = hist[i].san;
        const bSan = hist[i + 1] ? hist[i + 1].san : '';
        const wActive = activePly === i ? ' active-ply' : '';
        const bActive = activePly === (i + 1) ? ' active-ply' : '';
        html += `<div class="ledger-row">` +
          `<span>${(i / 2) + 1}.</span>` +
          `<span class="ledger-san${wActive}" data-ply="${i}">${wSan}</span>` +
          (bSan ? `<span class="ledger-san${bActive}" data-ply="${i + 1}">${bSan}</span>` : '<span></span>') +
          `</div>`;
      }
      ledger.innerHTML = html;
      const activeEl = typeof ledger.querySelector === 'function' ? ledger.querySelector('.active-ply') : null;
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      } else {
        ledger.scrollTop = ledger.scrollHeight;
      }
    }
  }
  updateClockUI();
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
  if (state.isAnimating) return;
  state.replayPly = null;
  state.replayGame = null;
  if (state.matchResult) {
    state.matchResult = null;
    clearSelection();
    updateHUD();
    return;
  }
  if (state.game.history().length === 0) return;
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
  state.matchResult = null;
  state.replayPly = null;
  state.replayGame = null;
  state.clockWhite = state.timeControl;
  state.clockBlack = state.timeControl;
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
  saveSettings();
}

export function toggleAudio() {
  sfx.muted = !sfx.muted;
  if (dom.muteBtn) dom.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  saveSettings();
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

export function exportFen() {
  const fen = state.game.fen();
  if (dom.ioTextarea) dom.ioTextarea.value = fen;
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fen).catch(() => {});
  }
  showToast('FEN copied to clipboard', 'info');
  return fen;
}

export function exportPgn() {
  const pgn = state.game.pgn();
  if (dom.ioTextarea) dom.ioTextarea.value = pgn;
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pgn).catch(() => {});
  }
  showToast('PGN copied to clipboard', 'info');
  return pgn;
}

export function importFen(fenString) {
  if (state.isAnimating) return false;
  const str = (fenString !== undefined ? fenString : (dom.ioTextarea ? dom.ioTextarea.value : '')).trim();
  if (!str) {
    showToast('Please enter a valid FEN string', 'warn');
    return false;
  }
  const testChess = new Chess();
  const success = testChess.load(str);
  if (!success) {
    showToast('Invalid FEN position string', 'error');
    return false;
  }

  state.gen++;
  state.matchResult = null;
  state.game.load(str);
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
  closeIoModal();
  showToast('FEN position loaded successfully', 'info');
  triggerAI();
  return true;
}

export function resignGame() {
  if (state.isAnimating || state.game.game_over() || state.matchResult) return;
  const winner = state.humanColor === 'w' ? 'OBSIDIAN GUARD' : 'MARBLE ORDER';
  state.gen++;
  state.matchResult = {
    status: `RESIGNATION — ${winner} WINS`,
    title: 'RESIGNATION',
    sub: `${state.humanColor === 'w' ? 'Marble Order' : 'Obsidian Guard'} surrendered the Cathedral Sanctuary.`
  };
  clearSelection();
  updateHUD();
  showToast('You have resigned the match', 'info');
}

export function offerDraw() {
  if (state.isAnimating || state.game.game_over() || state.matchResult) return false;
  if (state.aiDepth === 0) {
    state.gen++;
    state.matchResult = {
      status: 'MATCH DRAWN BY MUTUAL AGREEMENT',
      title: 'DRAW AGREED',
      sub: 'Both commanders agreed to a peaceful truce.'
    };
    clearSelection();
    updateHUD();
    showToast('Match drawn by mutual agreement', 'info');
    return true;
  }

  const hist = state.game.history();
  if (hist.length < 10) {
    showToast('AI declines draw offer — opening phase is still underway', 'warn');
    return false;
  }

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
  const aiAdvantage = state.humanColor === 'w' ? -diff : diff;

  if (aiAdvantage >= 2) {
    showToast('AI declines draw offer — it holds tactical advantage', 'warn');
    return false;
  }

  state.gen++;
  state.matchResult = {
    status: 'MATCH DRAWN BY AGREEMENT',
    title: 'DRAW ACCEPTED',
    sub: 'The Sanctuary AI has accepted your truce offer.'
  };
  clearSelection();
  updateHUD();
  showToast('AI accepted the draw offer', 'info');
  return true;
}

export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
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

export function setTimeControl(seconds) {
  state.timeControl = seconds;
  state.clockWhite = seconds;
  state.clockBlack = seconds;
  state.matchResult = null;
  document.querySelectorAll('#time-group .md-chip').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.time, 10) === seconds);
  });
  updateClockUI();
}

export function tickClock(dt) {
  if (state.timeControl <= 0 || state.game.game_over() || state.matchResult) return;
  if (state.game.history().length === 0) return;

  const turn = state.game.turn();
  if (turn === 'w') {
    state.clockWhite = Math.max(0, state.clockWhite - dt);
    if (state.clockWhite <= 0) {
      state.gen++;
      state.matchResult = {
        status: 'OBSIDIAN GUARD WINS ON TIME',
        title: 'TIME EXPIRED',
        sub: 'The Marble Order ran out of time.'
      };
      updateHUD();
      showToast('Time expired! Obsidian Guard wins on time.', 'warn');
    }
  } else {
    state.clockBlack = Math.max(0, state.clockBlack - dt);
    if (state.clockBlack <= 0) {
      state.gen++;
      state.matchResult = {
        status: 'MARBLE ORDER WINS ON TIME',
        title: 'TIME EXPIRED',
        sub: 'The Obsidian Guard ran out of time.'
      };
      updateHUD();
      showToast('Time expired! Marble Order wins on time.', 'warn');
    }
  }
  updateClockUI();
}

export function getReplayGame(ply) {
  if (ply === null || ply === undefined) return null;
  const history = state.game.history();
  if (ply >= history.length - 1) return null;
  const replay = new Chess();
  for (let i = 0; i <= ply; i++) {
    if (history[i]) replay.move(history[i]);
  }
  return replay;
}

export function setReplayPly(ply) {
  if (state.isAnimating) return;
  const hist = state.game.history({ verbose: true });
  if (hist.length === 0) {
    state.replayPly = null;
    state.replayGame = null;
    return;
  }
  if (ply === null || ply >= hist.length - 1) {
    state.replayPly = null;
    state.replayGame = null;
    const last = hist[hist.length - 1];
    state.lastMove = last ? { from: last.from, to: last.to } : null;
  } else {
    state.replayPly = Math.max(-1, ply);
    state.replayGame = getReplayGame(state.replayPly);
    if (state.replayPly >= 0 && hist[state.replayPly]) {
      state.lastMove = { from: hist[state.replayPly].from, to: hist[state.replayPly].to };
    } else {
      state.lastMove = null;
    }
  }
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
}

export function stepReplay(delta) {
  const hist = state.game.history();
  if (hist.length === 0) return;
  const currentPly = state.replayPly !== null ? state.replayPly : (hist.length - 1);
  const targetPly = currentPly + delta;
  if (targetPly >= hist.length - 1) {
    setReplayPly(null);
  } else if (targetPly < -1) {
    setReplayPly(-1);
  } else {
    setReplayPly(targetPly);
  }
}
