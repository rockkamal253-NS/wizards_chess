import { state } from './state.js';
import { dom } from './dom.js';
import { sfx } from './audio.js';
import { sqToWorld, rebuildTacticalMarkers, clearSelection, syncBoardFull, hoverCursor } from './board.js';
import { scene } from './materials.js';
import { updateHUD } from './hud.js';
import { showToast } from './toast.js';

// ============================================================================
// UNIFIED RAYCASTING (DETECTS BOTH 3D PIECES & BOARD TILES)
// ============================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function aiTurn() {
  return state.aiDepth > 0 && !state.game.game_over() && !state.matchResult && state.game.turn() !== state.humanColor;
}

export function getSquareUnderPointer(clientX, clientY, camera) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  let pieceSq = null;
  const pieceHits = raycaster.intersectObjects(Object.values(state.pieceMeshes), true);
  if (pieceHits.length > 0) {
    let obj = pieceHits[0].object;
    while (obj && !obj.userData.sq && obj.parent) obj = obj.parent;
    if (obj && obj.userData.sq) pieceSq = obj.userData.sq;
  }
  const tileHits = raycaster.intersectObjects(Object.values(state.squareMeshes), false);
  const tileSq = tileHits.length > 0 ? tileHits[0].object.userData.sq : null;

  if (pieceSq) {
    const p = state.game.get(pieceSq);
    const isDest = state.validMoves.some(m => m.to === pieceSq);
    const ownPiece = Boolean(p && p.color === state.game.turn());
    if (isDest || ownPiece) return pieceSq;
    // A tall piece that is neither capturable nor selectable must not swallow a click that is
    // really aimed at a highlighted destination square behind it.
    if (tileSq && state.validMoves.some(m => m.to === tileSq)) return tileSq;
    return pieceSq;
  }
  return tileSq;
}

const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

export function clearHover() {
  state.hoveredSq = null;
  hoverCursor.visible = false;
  if (dom.canvas) dom.canvas.classList.remove('pointer-piece');
}

export function updateHover(clientX, clientY, camera) {
  const sq = getSquareUnderPointer(clientX, clientY, camera);
  state.hoveredSq = sq;
  if (!sq) {
    clearHover();
    return;
  }
  const pos = sqToWorld(sq);
  hoverCursor.position.set(pos.x, 0.014, pos.z);
  hoverCursor.visible = true;
  const p = state.game.get(sq);
  if (dom.hoverSq) dom.hoverSq.textContent = `Square: ${sq.toUpperCase()}`;
  if (dom.hoverPiece) {
    dom.hoverPiece.textContent = p
      ? `${p.color === 'w' ? 'Marble' : 'Obsidian'} ${PIECE_NAMES[p.type]}`
      : 'Empty';
  }
  if (dom.canvas) {
    dom.canvas.classList.toggle(
      'pointer-piece',
      Boolean((p && p.color === state.game.turn()) || state.validMoves.some(m => m.to === sq))
    );
  }
}

const DRAG_THRESHOLD = 6;

export function endPointer() {
  state.pointerState = null;
  state.isDraggingCam = false;
  if (dom.canvas) dom.canvas.style.cursor = '';
}

export function onBoardClick(clientX, clientY, camera) {
  if (state.isAnimating || state.game.game_over() || state.matchResult || aiTurn()) return;
  const sq = getSquareUnderPointer(clientX, clientY, camera);
  if (sq) handleSquareClick(sq);
}

export function showPromotionDialog() {
  if (dom.promoModal) {
    dom.promoModal.classList.add('visible');
  }
}

export function hidePromotionDialog() {
  if (dom.promoModal) {
    dom.promoModal.classList.remove('visible');
  }
}

export function cancelPromotion() {
  state.pendingPromotion = null;
  hidePromotionDialog();
  rebuildTacticalMarkers();
}

export function selectPromotion(piece) {
  if (!state.pendingPromotion) return;
  const { from, to } = state.pendingPromotion;
  state.pendingPromotion = null;
  hidePromotionDialog();
  executeMoveAnimated(from, to, piece || 'q');
}

export function handleSquareClick(sq) {
  if (state.replayPly !== null) {
    state.replayPly = null;
    state.replayGame = null;
    clearSelection();
    syncBoardFull(scene);
    rebuildTacticalMarkers();
    updateHUD();
    return;
  }
  if (state.pendingPromotion || state.matchResult) return;
  state.hintMove = null;
  const vm = state.validMoves.find(m => m.to === sq);
  if (vm) {
    const p = state.game.get(vm.from);
    const isPawnPromotion = p && p.type === 'p' && (vm.to[1] === '8' || vm.to[1] === '1');
    if (isPawnPromotion) {
      state.pendingPromotion = { from: vm.from, to: vm.to };
      state.selectedSq = null;
      state.validMoves = [];
      rebuildTacticalMarkers();
      showPromotionDialog();
      return;
    }
    state.selectedSq = null;
    state.validMoves = [];
    rebuildTacticalMarkers();
    executeMoveAnimated(vm.from, vm.to, state.promoPiece || 'q');
    return;
  }

  const p = state.game.get(sq);
  if (p && p.color === state.game.turn()) {
    sfx.playSelect();
    state.selectedSq = sq;
    state.validMoves = state.game.moves({ square: sq, verbose: true });
    rebuildTacticalMarkers();
  } else {
    state.selectedSq = null;
    state.validMoves = [];
    rebuildTacticalMarkers();
  }
}

export function executeMoveAnimated(fromSq, toSq, promotion = 'q') {
  const moveObj = state.game.move({ from: fromSq, to: toSq, promotion });
  if (!moveObj) return false;

  state.isAnimating = true;
  state.lastMove = moveObj;
  sfx.playSlide();

  const attacker = state.pieceMeshes[fromSq];
  const isCapture = Boolean(moveObj.captured);
  let capturedSq = toSq;
  if (moveObj.flags.includes('e')) {
    capturedSq = toSq[0] + fromSq[1];
  }
  const defender = isCapture ? state.pieceMeshes[capturedSq] : null;

  let rookAnim = null;
  if (moveObj.flags.includes('k') || moveObj.flags.includes('q')) {
    const rank = fromSq[1];
    const rFrom = moveObj.flags.includes('k') ? 'h' + rank : 'a' + rank;
    const rTo = moveObj.flags.includes('k') ? 'f' + rank : 'd' + rank;
    const rMesh = state.pieceMeshes[rFrom];
    if (rMesh) {
      delete state.pieceMeshes[rFrom];
      state.pieceMeshes[rTo] = rMesh;
      rMesh.userData.sq = rTo;
      rookAnim = { mesh: rMesh, start: sqToWorld(rFrom), end: sqToWorld(rTo) };
    }
  }

  state.activeAnim = {
    moveObj, attacker, defender, capturedSq,
    start: sqToWorld(fromSq), end: sqToWorld(toSq),
    isCapture, shattered: false, elapsed: 0,
    duration: isCapture ? 0.64 : 0.42, rookAnim
  };
  return true;
}

export async function triggerAI() {
  if (!aiTurn() || state.isAnimating || state.aiPendingGen === state.gen) return;
  const myGen = state.gen;
  const fenAtStart = state.game.fen();
  state.aiPendingGen = myGen;
  if (dom.statusText) {
    dom.statusText.textContent =
      `${state.game.turn() === 'w' ? 'MARBLE ORDER' : 'OBSIDIAN GUARD'} PONDERING...`;
  }

  let aiMove = null;
  let bridgeError = null;
  const history = state.game.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
  try {
    if (window.pywebview && window.pywebview.api) {
      aiMove = await window.pywebview.api.compute_ai_move(fenAtStart, state.aiDepth, history, state.startFen);
    }
  } catch (e) {
    bridgeError = e;
    console.error('AI bridge encountered an error:', { error: e, fen: fenAtStart, depth: state.aiDepth });
  } finally {
    if (state.aiPendingGen === myGen) state.aiPendingGen = -1;
  }

  // The position changed while the engine was thinking (undo / reset / mode switch): discard.
  if (myGen !== state.gen || state.game.fen() !== fenAtStart || !aiTurn()) {
    updateHUD();
    return;
  }

  const legal = state.game.moves({ verbose: true });
  if (legal.length === 0) return;

  const isLegal = Boolean(aiMove && legal.some(m => m.from === aiMove.from && m.to === aiMove.to));
  if (window.pywebview && window.pywebview.api && (!isLegal || bridgeError)) {
    const reason = bridgeError
      ? `Bridge error: ${bridgeError.message || bridgeError}`
      : (!aiMove ? 'AI returned no move' : `AI returned illegal move (${aiMove.from}-${aiMove.to})`);
    console.warn('AI move fallback triggered:', { reason, fen: fenAtStart, aiMove, bridgeError });
    showToast(`${reason} — fell back to random legal move`, 'warn');
  }

  // Two rule engines are in play, so never trust the bridge blindly: confirm legality here.
  if (!isLegal) {
    aiMove = legal[Math.floor(Math.random() * legal.length)];
  }
  executeMoveAnimated(aiMove.from, aiMove.to, aiMove.promotion || 'q');
}

export async function showTacticalHint() {
  if (state.isAnimating || state.game.game_over() || aiTurn()) return;
  const myGen = state.gen;
  const fenAtStart = state.game.fen();
  const history = state.game.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
  let suggestion = null;
  let hintError = null;
  try {
    if (window.pywebview && window.pywebview.api) {
      suggestion = await window.pywebview.api.compute_hint(fenAtStart, history, state.startFen);
    }
  } catch (e) {
    hintError = e;
    console.error('Hint bridge encountered an error:', { error: e, fen: fenAtStart });
  }
  if (myGen !== state.gen || state.game.fen() !== fenAtStart || state.isAnimating || aiTurn()) return;

  const legal = state.game.moves({ verbose: true });
  if (legal.length === 0) return;

  const isLegal = Boolean(suggestion && legal.some(m => m.from === suggestion.from && m.to === suggestion.to));
  if (window.pywebview && window.pywebview.api && (!isLegal || hintError)) {
    const reason = hintError
      ? `Hint bridge error: ${hintError.message || hintError}`
      : (!suggestion ? 'Hint returned no move' : `Hint returned illegal move (${suggestion.from}-${suggestion.to})`);
    console.warn('Hint fallback triggered:', { reason, fen: fenAtStart, suggestion, hintError });
    showToast(`${reason} — fell back to first legal move`, 'warn');
  }

  if (!isLegal) {
    suggestion = legal[0];
  }
  state.hintMove = suggestion;
  state.selectedSq = suggestion.from;
  state.validMoves = state.game.moves({ square: suggestion.from, verbose: true });
  sfx.playSelect();
  rebuildTacticalMarkers();
}

export function initInput(camera, canvas) {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 2) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    state.pointerState = {
      id: e.pointerId, button: e.button,
      startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
      orbiting: e.button === 2
    };
    state.isDraggingCam = state.pointerState.orbiting;
    if (state.isDraggingCam) {
      clearHover();
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('pointermove', e => {
    const ps = state.pointerState;
    if (ps && ps.id === e.pointerId) {
      if (!ps.orbiting && Math.hypot(e.clientX - ps.startX, e.clientY - ps.startY) > DRAG_THRESHOLD) {
        ps.orbiting = true;
        state.isDraggingCam = true;
        clearHover();
        canvas.style.cursor = 'grabbing';
      }
      if (ps.orbiting) {
        state.targetYaw -= (e.clientX - ps.lastX) * 0.007;
        state.targetPitch = Math.max(0.22, Math.min(1.42, state.targetPitch + (e.clientY - ps.lastY) * 0.006));
      }
      ps.lastX = e.clientX;
      ps.lastY = e.clientY;
      if (ps.orbiting) return;
    }
    updateHover(e.clientX, e.clientY, camera);
  });

  canvas.addEventListener('pointerup', e => {
    const ps = state.pointerState;
    if (!ps || ps.id !== e.pointerId) return;
    endPointer();
    if (ps.button === 0 && !ps.orbiting) onBoardClick(e.clientX, e.clientY, camera);
  });

  canvas.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', endPointer);
  window.addEventListener('pointermove', e => {
    if (e.target !== canvas && !state.pointerState) clearHover();
  });
}
