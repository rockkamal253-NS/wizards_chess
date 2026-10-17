// ============================================================================
// PURE MATCH & RULES LOGIC (HEADLESS / TESTABLE WITHOUT DOM)
// ============================================================================

export const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Formats seconds into MM:SS string. */
export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/** Computes white material minus black material in centipawn units. */
export function calculateMaterialDifference(game) {
  let wMat = 0;
  let bMat = 0;
  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = game.get(FILES[f] + r);
      if (p) {
        if (p.color === 'w') wMat += VALS[p.type];
        else bMat += VALS[p.type];
      }
    }
  }
  return wMat - bMat;
}

/** Computes matchResult descriptor when a side surrenders. */
export function calculateResignResult(resigningColor) {
  const winner = resigningColor === 'w' ? 'OBSIDIAN GUARD' : 'MARBLE ORDER';
  return {
    status: `RESIGNATION — ${winner} WINS`,
    title: 'RESIGNATION',
    sub: `${resigningColor === 'w' ? 'Marble Order' : 'Obsidian Guard'} surrendered the Cathedral Sanctuary.`
  };
}

/**
 * Evaluates a draw offer. Returns an object:
 * { accepted: boolean, message: string, toastType: 'info' | 'warn', result?: object }
 */
export function evaluateDrawOffer(game, humanColor, aiDepth) {
  if (aiDepth === 0) {
    return {
      accepted: true,
      message: 'Match drawn by mutual agreement',
      toastType: 'info',
      result: {
        status: 'MATCH DRAWN BY MUTUAL AGREEMENT',
        title: 'DRAW AGREED',
        sub: 'Both commanders agreed to a peaceful truce.'
      }
    };
  }

  const hist = game.history();
  if (hist.length < 10) {
    return {
      accepted: false,
      message: 'AI declines draw offer — opening phase is still underway',
      toastType: 'warn'
    };
  }

  const diff = calculateMaterialDifference(game);
  const aiAdvantage = humanColor === 'w' ? -diff : diff;
  if (aiAdvantage >= 2) {
    return {
      accepted: false,
      message: 'AI declines draw offer — it holds tactical advantage',
      toastType: 'warn'
    };
  }

  return {
    accepted: true,
    message: 'AI accepted the draw offer',
    toastType: 'info',
    result: {
      status: 'MATCH DRAWN BY AGREEMENT',
      title: 'DRAW ACCEPTED',
      sub: 'The Sanctuary AI has accepted your truce offer.'
    }
  };
}

/**
 * Validates FEN string placement integrity and king parity.
 * Returns { valid: boolean, error?: string }
 */
export function validateFenString(fenString, ChessCtor) {
  if (!fenString || typeof fenString !== 'string' || !fenString.trim()) {
    return { valid: false, error: 'Empty FEN string' };
  }
  const str = fenString.trim();
  const testChess = new ChessCtor();
  if (!testChess.load(str)) {
    return { valid: false, error: 'Invalid FEN position string' };
  }
  if (testChess.fen().split(' ')[0] !== str.split(/\s+/)[0]) {
    return { valid: false, error: 'Invalid position: the piece placement could not be loaded as written' };
  }
  const kings = { w: 0, b: 0 };
  for (const row of testChess.board()) {
    for (const p of row) {
      if (p && p.type === 'k') kings[p.color]++;
    }
  }
  if (kings.w !== 1 || kings.b !== 1) {
    return { valid: false, error: 'Invalid position: each side needs exactly one king' };
  }
  return { valid: true };
}
