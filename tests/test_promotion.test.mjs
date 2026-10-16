import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { Chess } = createRequire(import.meta.url)('../web/vendor/chess.js');
globalThis.Chess = Chess;

// Mock DOM elements needed for UI transition testing
const mockElements = {
  'promo-modal': {
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    }
  },
  'gl-canvas': { classList: { remove() {}, toggle() {} }, style: {} },
  'status-text': { textContent: '' },
  'turn-badge': { classList: { toggle() {} } },
  'turn-dot': { style: {} },
  'card-white': { classList: { toggle() {} } },
  'card-black': { classList: { toggle() {} } },
  'hover-sq': { textContent: '' },
  'hover-piece': { textContent: '' },
  'end-modal': { classList: { add() {}, remove() {} } },
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
const { handleSquareClick, selectPromotion, cancelPromotion, triggerAI } = await import('../web/input.js');

test('Pawn moving to 8th rank enters pendingPromotion and opens dialog', () => {
  // Set up board with white pawn on a7 ready to promote to a8
  state.game = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  state.selectedSq = null;
  state.validMoves = [];
  state.pendingPromotion = null;
  state.isAnimating = false;
  state.humanColor = 'w';
  mockElements['promo-modal'].classList.remove('visible');

  // 1. Click a7 to select pawn
  handleSquareClick('a7');
  assert.equal(state.selectedSq, 'a7');
  assert.ok(state.validMoves.length > 0);
  assert.equal(state.pendingPromotion, null);
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), false);

  // 2. Click a8: must NOT immediately make move in game; must trigger promotion dialog
  handleSquareClick('a8');
  assert.deepEqual(state.pendingPromotion, { from: 'a7', to: 'a8' });
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), true);
  // Game has not moved yet (still white to move, pawn still on a7)
  assert.equal(state.game.turn(), 'w');
  assert.equal(state.game.get('a7').type, 'p');
  assert.equal(state.game.get('a8'), null);

  // 3. User selects Knight underpromotion
  selectPromotion('n');
  assert.equal(state.pendingPromotion, null);
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), false);
  // Move is now completed in game with selected piece
  assert.equal(state.game.turn(), 'b');
  assert.equal(state.game.get('a8').type, 'n');
});

test('Non-promotion move does not trigger promotion dialog', () => {
  state.game = new Chess();
  state.selectedSq = null;
  state.validMoves = [];
  state.pendingPromotion = null;
  state.isAnimating = false;
  mockElements['promo-modal'].classList.remove('visible');

  handleSquareClick('e2');
  assert.equal(state.selectedSq, 'e2');
  handleSquareClick('e4');

  assert.equal(state.pendingPromotion, null);
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), false);
  assert.equal(state.game.get('e4').type, 'p');
});

test('Cancel promotion restores state without executing move', () => {
  state.game = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  state.selectedSq = null;
  state.validMoves = [];
  state.pendingPromotion = null;
  state.isAnimating = false;
  mockElements['promo-modal'].classList.remove('visible');

  handleSquareClick('a7');
  handleSquareClick('a8');
  assert.ok(state.pendingPromotion);
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), true);

  cancelPromotion();
  assert.equal(state.pendingPromotion, null);
  assert.equal(mockElements['promo-modal'].classList.contains('visible'), false);
  assert.equal(state.game.turn(), 'w');
  assert.equal(state.game.get('a7').type, 'p');
});

test('Bridge failure or invalid move triggers toast and falls back to legal move', async () => {
  // AI is playing black, it is black's turn
  state.game = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  state.humanColor = 'w';
  state.aiDepth = 2;
  state.isAnimating = false;
  state.aiPendingGen = -1;
  mockElements['toast-container'].children = [];

  // Mock pywebview bridge returning an illegal move
  globalThis.window.pywebview = {
    api: {
      compute_ai_move: async () => ({ from: 'e8', to: 'a1', promotion: 'q' })
    }
  };

  await triggerAI();

  // Toast container should have received a notification
  assert.ok(mockElements['toast-container'].children.length > 0);
  assert.match(mockElements['toast-container'].children[0].textContent, /illegal move/i);

  // But the game still moved legally!
  assert.equal(state.game.turn(), 'w');
  assert.ok(state.activeAnim !== null || state.game.history().length > 0);
});

test('Bridge throwing error triggers toast and falls back to legal move', async () => {
  state.game = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  state.humanColor = 'w';
  state.aiDepth = 2;
  state.isAnimating = false;
  state.aiPendingGen = -1;
  mockElements['toast-container'].children = [];

  globalThis.window.pywebview = {
    api: {
      compute_ai_move: async () => { throw new Error('Bridge timeout test'); }
    }
  };

  await triggerAI();

  assert.ok(mockElements['toast-container'].children.length > 0);
  assert.match(mockElements['toast-container'].children[0].textContent, /bridge error/i);
  assert.equal(state.game.turn(), 'w');
});

