import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  formatClock,
  calculateMaterialDifference,
  calculateResignResult,
  evaluateDrawOffer,
  validateFenString
} from '../web/match.js';

const { Chess } = createRequire(import.meta.url)('../web/vendor/chess.js');

test('formatClock formats seconds into MM:SS correctly', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(59), '00:59');
  assert.equal(formatClock(60), '01:00');
  assert.equal(formatClock(305), '05:05');
  assert.equal(formatClock(600), '10:00');
});

test('calculateMaterialDifference accurately sums piece values', () => {
  const g = new Chess();
  assert.equal(calculateMaterialDifference(g), 0);

  // White up a Queen
  const gWhiteQueen = new Chess('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(calculateMaterialDifference(gWhiteQueen), 9);

  // Black up a Rook
  const gBlackRook = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1');
  assert.equal(calculateMaterialDifference(gBlackRook), -5);
});

test('calculateResignResult formats resignation outcomes', () => {
  const whiteResigns = calculateResignResult('w');
  assert.ok(whiteResigns.status.includes('OBSIDIAN GUARD WINS'));
  assert.equal(whiteResigns.title, 'RESIGNATION');
  assert.ok(whiteResigns.sub.includes('Marble Order'));

  const blackResigns = calculateResignResult('b');
  assert.ok(blackResigns.status.includes('MARBLE ORDER WINS'));
  assert.ok(blackResigns.sub.includes('Obsidian Guard'));
});

test('evaluateDrawOffer handles 2-player, early opening, and material advantage', () => {
  const g = new Chess();

  // Two-player mode: always accepted
  const twoPlayer = evaluateDrawOffer(g, 'w', 0);
  assert.equal(twoPlayer.accepted, true);
  assert.ok(twoPlayer.result.status.includes('MUTUAL AGREEMENT'));

  // AI mode: declined in opening (< 10 moves)
  const openingAi = evaluateDrawOffer(g, 'w', 2);
  assert.equal(openingAi.accepted, false);
  assert.ok(openingAi.message.includes('opening phase'));

  // Play 10 moves (5 full turns)
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'].forEach(m => g.move(m));
  const midgameEqual = evaluateDrawOffer(g, 'w', 2);
  assert.equal(midgameEqual.accepted, true);

  // White down a piece after 10 plies:
  const gAiAhead = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7'].forEach(m => gAiAhead.move(m));
  // White sacrificed a knight (3) for a pawn (1) -> down 2 points of material. AI (Black) holds +2 advantage.
  const aiAhead = evaluateDrawOffer(gAiAhead, 'w', 2);
  assert.equal(aiAhead.accepted, false);
  assert.ok(aiAhead.message.includes('tactical advantage'));
});

test('validateFenString verifies position and king parity without DOM', () => {
  assert.equal(validateFenString('', Chess).valid, false);
  assert.equal(validateFenString('not a fen', Chess).valid, false);
  // Missing white king
  assert.equal(validateFenString('4k3/8/8/8/8/8/8/8 w - - 0 1', Chess).valid, false);
  // Two white kings
  assert.equal(validateFenString('4k3/8/8/8/8/8/8/K2K4 w - - 0 1', Chess).valid, false);
  // Valid starting position
  assert.equal(validateFenString('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', Chess).valid, true);
});
