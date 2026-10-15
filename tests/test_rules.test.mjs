// Rules tests for the vendored chess.js (the UI's source of truth for legality).
// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { Chess } = createRequire(import.meta.url)('../web/vendor/chess.js');

const CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

test('castling kingside and queenside', () => {
  assert.equal(new Chess(CASTLE).move({ from: 'e1', to: 'g1' }).flags, 'k');
  assert.equal(new Chess(CASTLE).move({ from: 'e1', to: 'c1' }).flags, 'q');
});
test('cannot castle through check', () => {
  assert.equal(new Chess('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1').move({ from: 'e1', to: 'g1' }), null);
});
test('en passant', () => {
  const g = new Chess('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3');
  assert.equal(g.move({ from: 'd4', to: 'e3' }).flags, 'e');
});
test('underpromotion', () => {
  const m = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1').move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(m.promotion, 'n');
});
test('stalemate, insufficient material, 50-move rule, repetition', () => {
  assert.ok(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').in_stalemate());
  assert.ok(new Chess('8/8/8/8/8/5k2/8/5K1N w - - 0 1').insufficient_material());
  const g = new Chess('8/8/8/8/8/5k2/8/R3K3 w - - 99 80'); g.move('Ra2');
  assert.ok(g.in_draw());
  const r = new Chess(); for (let i = 0; i < 2; i++) ['Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(m => r.move(m));
  assert.ok(r.in_threefold_repetition());
});
test('white king on e1, queen on d1; a1 is dark (board parity invariant)', () => {
  const g = new Chess();
  assert.deepEqual(g.get('e1'), { type: 'k', color: 'w' });
  assert.deepEqual(g.get('d1'), { type: 'q', color: 'w' });
});
