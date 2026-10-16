import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { Chess } = createRequire(import.meta.url)('../web/vendor/chess.js');
globalThis.Chess = Chess;

const mockElements = {
  'io-modal': {
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    }
  },
  'io-textarea': { value: '' },
  'gl-canvas': { classList: { remove() {}, toggle() {} }, style: {} },
  'status-text': { textContent: '' },
  'turn-badge': { classList: { toggle() {} } },
  'turn-dot': { style: {} },
  'card-white': { classList: { toggle() {} } },
  'card-black': { classList: { toggle() {} } },
  'hover-sq': { textContent: '' },
  'hover-piece': { textContent: '' },
  'end-modal': {
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    }
  },
  'modal-title': { textContent: '' },
  'modal-sub': { textContent: '' },
  'cap-white': { textContent: '' },
  'cap-black': { textContent: '' },
  'adv-white': { textContent: '' },
  'adv-black': { textContent: '' },
  'eval-fill': { style: {} },
  'ledger-list': { innerHTML: '', scrollTop: 0, scrollHeight: 0 },
  'move-count': { textContent: '' },
  'mute-btn': { textContent: '' },
  'quality-btn': { textContent: '' },
  'telemetry': { textContent: '' },
  'toast-container': {
    children: [],
    appendChild(el) { this.children.push(el); }
  }
};

globalThis.document = {
  getElementById: id => mockElements[id] || null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({
    classList: { add() {}, remove() {} },
    getContext: () => ({
      fillStyle: '',
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      strokeRect() {}
    }),
    width: 512,
    height: 512
  })
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: () => {}
};
globalThis.performance = { now: () => 1000 };

const threeMin = createRequire(import.meta.url)('../web/vendor/three.min.js');
const THREE = Object.create(threeMin);
THREE.WebGLRenderer = class {
  setSize() {}
  setPixelRatio() {}
  getContext() { return { getExtension() { return null; } }; }
  capabilities = { getMaxAnisotropy: () => 16 };
  shadowMap = {};
  render() {}
};
THREE.PMREMGenerator = class {
  compileCubemapShader() {}
  fromScene() { return { texture: {} }; }
  dispose() {}
};
globalThis.THREE = THREE;

const { state } = await import('../web/state.js');
const {
  openIoModal,
  closeIoModal,
  exportFen,
  exportPgn,
  importFen,
  resignGame,
  offerDraw,
  undoMove,
  resetGame
} = await import('../web/hud.js');
const { handleSquareClick } = await import('../web/input.js');

test('IO modal open/close controls visibility and populates textarea', () => {
  state.game = new Chess();
  mockElements['io-modal'].classList.remove('visible');
  mockElements['io-textarea'].value = '';

  openIoModal();
  assert.equal(mockElements['io-modal'].classList.contains('visible'), true);
  assert.equal(mockElements['io-textarea'].value, state.game.fen());

  closeIoModal();
  assert.equal(mockElements['io-modal'].classList.contains('visible'), false);
});

test('exportFen returns current FEN and writes to textarea', () => {
  state.game = new Chess();
  state.game.move('e4');
  const fen = exportFen();
  assert.equal(fen, state.game.fen());
  assert.equal(mockElements['io-textarea'].value, fen);
});

test('exportPgn returns current PGN and writes to textarea', () => {
  state.game = new Chess();
  state.game.move('e4');
  state.game.move('e5');
  const pgn = exportPgn();
  assert.ok(pgn.includes('1. e4 e5'));
  assert.equal(mockElements['io-textarea'].value, pgn);
});

test('importFen loads valid FEN position and bumps gen', () => {
  state.game = new Chess();
  const initGen = state.gen;
  const targetFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  
  const ok = importFen(targetFen);
  assert.equal(ok, true);
  assert.equal(state.game.fen(), targetFen);
  assert.ok(state.gen > initGen);
});

test('importFen rejects invalid FEN and does not mutate game', () => {
  state.game = new Chess();
  const beforeFen = state.game.fen();
  const initGen = state.gen;

  const ok = importFen('invalid fen string 123');
  assert.equal(ok, false);
  assert.equal(state.game.fen(), beforeFen);
  assert.equal(state.gen, initGen);
});

test('importFen rejects empty FEN string', () => {
  state.game = new Chess();
  const beforeFen = state.game.fen();
  const ok = importFen('   ');
  assert.equal(ok, false);
  assert.equal(state.game.fen(), beforeFen);
});

test('resignGame sets matchResult and prevents moves until reset', () => {
  state.game = new Chess();
  state.humanColor = 'w';
  state.matchResult = null;
  state.isAnimating = false;
  state.pendingPromotion = null;
  const initialGen = state.gen;

  resignGame();
  assert.ok(state.matchResult);
  assert.ok(state.matchResult.status.includes('OBSIDIAN GUARD WINS'));
  assert.ok(state.gen > initialGen);
  assert.equal(mockElements['end-modal'].classList.contains('visible'), true);

  // Moves should now be blocked
  handleSquareClick('e2');
  assert.equal(state.selectedSq, null);

  // Undo cancels resignation
  undoMove();
  assert.equal(state.matchResult, null);
});

test('offerDraw in 2-player mode is accepted immediately by mutual agreement', () => {
  state.game = new Chess();
  state.aiDepth = 0;
  state.matchResult = null;

  const accepted = offerDraw();
  assert.equal(accepted, true);
  assert.ok(state.matchResult);
  assert.ok(state.matchResult.title.includes('DRAW AGREED'));
});

test('offerDraw vs AI is declined in early opening', () => {
  state.game = new Chess();
  state.aiDepth = 2;
  state.humanColor = 'w';
  state.matchResult = null;

  // 0 moves played (< 10)
  const accepted = offerDraw();
  assert.equal(accepted, false);
  assert.equal(state.matchResult, null);
});

test('offerDraw vs AI is accepted when position is late game or AI is not winning', () => {
  state.game = new Chess();
  state.aiDepth = 2;
  state.humanColor = 'w';
  state.matchResult = null;

  // Load a 30-move position with equal material or AI down
  state.game.load('4k3/8/8/8/8/8/4P3/4K3 w - - 0 35');
  // White has pawn (+1), AI has nothing (-1 disadvantage for AI)
  // Need history length >= 10:
  // Let's mock history to have length >= 10
  const origHist = state.game.history.bind(state.game);
  state.game.history = () => new Array(20).fill('e4');

  const accepted = offerDraw();
  assert.equal(accepted, true);
  assert.ok(state.matchResult);
  assert.ok(state.matchResult.title.includes('DRAW ACCEPTED'));

  state.game.history = origHist;
});
