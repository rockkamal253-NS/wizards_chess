import { state } from './state.js';
import { dom } from './dom.js';
import { syncBoardFull, rebuildTacticalMarkers, clearSelection } from './board.js';
import { scene } from './materials.js';
import { showToast } from './toast.js';
import { saveSettings } from './settings.js';
import { updateHUD, updateClockUI, closeIoModal } from './hud.js';
import { triggerAI, showTacticalHint } from './input.js';
import {
  formatClock,
  calculateResignResult,
  evaluateDrawOffer,
  validateFenString
} from './match.js';

export { formatClock, triggerAI, showTacticalHint };

// ============================================================================
// GAME COMMANDS & FLOW ORCHESTRATION
// ============================================================================

export function undoMove() {
  if (state.isAnimating) return;
  if (state.replayPly !== null) {
    state.replayPly = null;
    state.replayGame = null;
    updateHUD();
  }
  if (state.matchResult) {
    state.gen++;
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
  state.startFen = null;
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
  triggerAI();
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

export function exportFen() {
  const fen = state.game.fen();
  if (dom.ioTextarea) dom.ioTextarea.value = fen;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fen).catch(() => {});
  }
  showToast('FEN copied to clipboard', 'info');
  return fen;
}

export function exportPgn() {
  const pgn = state.game.pgn();
  if (dom.ioTextarea) dom.ioTextarea.value = pgn;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pgn).catch(() => {});
  }
  showToast('PGN copied to clipboard', 'info');
  return pgn;
}

export function importFen(fenString) {
  const inputStr = fenString !== undefined ? fenString : (dom.ioTextarea ? dom.ioTextarea.value : '');
  const validation = validateFenString(inputStr, Chess);
  if (!validation.valid) {
    showToast(validation.error || 'Invalid FEN position string', 'error');
    return false;
  }

  const str = inputStr.trim();
  state.gen++;
  state.matchResult = null;
  state.game.load(str);
  state.startFen = state.game.fen();
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
  const resigning = state.aiDepth === 0 ? state.game.turn() : state.humanColor;
  state.gen++;
  state.matchResult = calculateResignResult(resigning);
  clearSelection();
  updateHUD();
  showToast(state.aiDepth === 0 ? 'Match resigned' : 'You have resigned the match', 'info');
}

export function offerDraw() {
  if (state.isAnimating || state.game.game_over() || state.matchResult) return false;
  const decision = evaluateDrawOffer(state.game, state.humanColor, state.aiDepth);
  if (decision.accepted) {
    state.gen++;
    state.matchResult = decision.result;
    clearSelection();
    updateHUD();
  }
  showToast(decision.message, decision.toastType);
  return decision.accepted;
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
  const history = state.game.history();
  if (ply === null || ply >= history.length - 1) {
    state.replayPly = null;
    state.replayGame = null;
  } else {
    state.replayPly = Math.max(0, ply);
    state.replayGame = getReplayGame(state.replayPly);
  }
  clearSelection();
  syncBoardFull(scene);
  rebuildTacticalMarkers();
  updateHUD();
}

export function stepReplay(delta) {
  const history = state.game.history();
  if (history.length === 0) return;
  const currentPly = state.replayPly !== null ? state.replayPly : history.length - 1;
  const nextPly = currentPly + delta;
  if (nextPly < 0) return;
  if (nextPly >= history.length - 1) {
    setReplayPly(null);
  } else {
    setReplayPly(nextPly);
  }
}
