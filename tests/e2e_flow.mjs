import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { startStaticServer } from './static_server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(__dirname, 'e2e_output');

// Parse CLI flags
const argv = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith(prefix + '=')) return argv[i].slice(prefix.length + 1);
    if (argv[i] === prefix && i + 1 < argv.length) return argv[i + 1];
  }
  return fallback;
}
function hasFlag(flag) {
  return argv.some(a => a === flag || a.startsWith(flag + '='));
}

const IS_HEADED = hasFlag('--headed');
const SLOWMO = parseInt(getArg('--slowmo', '0'), 10);
const KEEP_OPEN = hasFlag('--keep-open');
const ONLY = getArg('--only');
const RUN_PYTHON = hasFlag('--python');
const RUN_REAL_APP = hasFlag('--real-app');
const BASE_URL_OVERRIDE = getArg('--base-url');

const CHROMIUM_FLAGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--mute-audio'
];

// Helper to wait for the board to settle (no animation and no pending AI call)
async function waitSettled(page, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s1 = await page.evaluate(() => {
      const s = window.state || window.__state;
      return Boolean(s && !s.isAnimating && s.aiPendingGen === -1);
    });
    if (s1) {
      await page.waitForTimeout(300);
      const s2 = await page.evaluate(() => {
        const s = window.state || window.__state;
        return Boolean(s && !s.isAnimating && s.aiPendingGen === -1);
      });
      if (s2) return;
    } else {
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`Timed out waiting for board to settle (${timeoutMs}ms)`);
}

// Helper to wait for render loop liveness (state.lastTime advancing)
async function waitRenderLoopAlive(page, timeoutMs = 45000) {
  const start = Date.now();
  const t0 = await page.evaluate(() => (window.state ? window.state.lastTime : 0));
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(200);
    const t1 = await page.evaluate(() => (window.state ? window.state.lastTime : 0));
    if (t1 > t0) return true;
  }
  throw new Error(`Render loop failed to advance lastTime within ${timeoutMs}ms`);
}

// Click square using findClickPoint hook
async function clickSquare(page, sq) {
  const pt = await page.evaluate(s => window.findClickPoint(s), sq);
  if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') {
    throw new Error(`findClickPoint returned invalid coordinates for square ${sq}: ${JSON.stringify(pt)}`);
  }
  await page.mouse.click(pt.x, pt.y);
}

// Inject fake Python bridge before scripts run
async function setupFakeBridge(context, enabled = true) {
  if (!enabled) return;
  await context.addInitScript(() => {
    window.__fakeBridge = {
      calls: [],
      mode: 'first-legal',
      fixedMove: null,
      delayMs: 0,
      fullscreenCalls: 0,
      setMode(m, fixed = null) {
        this.mode = m;
        this.fixedMove = fixed;
      },
      setDelay(ms) {
        this.delayMs = ms;
      }
    };

    window.pywebview = {
      api: {
        async compute_ai_move(fen, depth, history, startFen) {
          const fb = window.__fakeBridge;
          fb.calls.push({ type: 'ai_move', fen, depth, history, startFen, time: performance.now() });
          if (fb.delayMs > 0) {
            await new Promise(r => setTimeout(r, fb.delayMs));
          }
          if (fb.mode === 'throw') throw new Error('Bridge throw simulated');
          if (fb.mode === 'null') return null;
          if (fb.mode === 'illegal') return { from: 'e2', to: 'e5', promotion: 'q' };
          if (fb.mode === 'fixed') return fb.fixedMove;

          const g = new window.Chess(fen);
          const moves = g.moves({ verbose: true });
          if (moves.length === 0) return null;
          return { from: moves[0].from, to: moves[0].to, promotion: moves[0].promotion || 'q' };
        },
        async compute_hint(fen, history, startFen) {
          const fb = window.__fakeBridge;
          fb.calls.push({ type: 'hint', fen, history, startFen, time: performance.now() });
          if (fb.delayMs > 0) {
            await new Promise(r => setTimeout(r, fb.delayMs));
          }
          if (fb.mode === 'throw') throw new Error('Bridge throw simulated');
          if (fb.mode === 'null') return null;
          if (fb.mode === 'illegal') return { from: 'e2', to: 'e5', promotion: 'q' };
          if (fb.mode === 'fixed') return fb.fixedMove;

          const g = new window.Chess(fen);
          const moves = g.moves({ verbose: true });
          if (moves.length === 0) return null;
          return { from: moves[0].from, to: moves[0].to, promotion: moves[0].promotion || 'q' };
        },
        async toggle_fullscreen() {
          const fb = window.__fakeBridge;
          fb.fullscreenCalls++;
          fb.calls.push({ type: 'fullscreen', time: performance.now() });
          return true;
        }
      }
    };
  });
}

// ----------------------------------------------------------------------------
// 16 SCENARIOS DEFINITION
// ----------------------------------------------------------------------------
const SCENARIOS = [
  {
    id: 1,
    name: 'boot',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();

      const pageErrors = [];
      const netErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error') pageErrors.push(msg.text());
      });
      page.on('requestfailed', req => netErrors.push(`${req.url()} (${req.failure()?.errorText})`));
      page.on('response', resp => {
        if (resp.status() >= 400) netErrors.push(`${resp.status()} ${resp.url()}`);
      });

      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);
      await waitRenderLoopAlive(page);

      if (pageErrors.length > 0) throw new Error(`Page/console errors on boot: ${pageErrors.join('; ')}`);
      if (netErrors.length > 0) throw new Error(`Network errors on boot: ${netErrors.join('; ')}`);

      // Canvas fills window
      const canvasSize = await page.evaluate(() => {
        const c = document.getElementById('gl-canvas');
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, winW: window.innerWidth, winH: window.innerHeight };
      });
      if (canvasSize.w !== canvasSize.winW || canvasSize.h !== canvasSize.winH) {
        throw new Error(`Canvas does not fill window: ${JSON.stringify(canvasSize)}`);
      }

      // 22 toolbar buttons
      const btnCount = await page.evaluate(() => document.querySelectorAll('.top-bar button').length);
      if (btnCount !== 22) throw new Error(`Expected 22 toolbar buttons, found ${btnCount}`);

      // 32 pieces and 64 squares
      const counts = await page.evaluate(() => ({
        pieces: Object.keys(window.state.pieceMeshes).length,
        squares: Object.keys(window.state.squareMeshes).length
      }));
      if (counts.pieces !== 32) throw new Error(`Expected 32 pieces, found ${counts.pieces}`);
      if (counts.squares !== 64) throw new Error(`Expected 64 squares, found ${counts.squares}`);

      // Start position
      const fen = await page.evaluate(() => window.state.game.fen());
      if (fen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        throw new Error(`Unexpected start FEN: ${fen}`);
      }

      // Telemetry shows an FPS value
      await page.waitForFunction(() => {
        const tel = document.getElementById('telemetry');
        return tel && /\d+\s*FPS/.test(tel.textContent);
      }, { timeout: 15000 });

      await context.close();
    }
  },

  {
    id: 2,
    name: 'production_page',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      const page = await context.newPage();

      await page.goto(`${baseUrl}/index.html`);
      await page.waitForTimeout(1000);

      const leaked = await page.evaluate(() => {
        const forbidden = ['state', '__state', 'handleSquareClick', 'resetGame', 'importFen', 'squareToScreen', 'findClickPoint'];
        return forbidden.filter(f => typeof window[f] !== 'undefined');
      });
      if (leaked.length > 0) {
        throw new Error(`Forbidden properties leaked to window in production: ${leaked.join(', ')}`);
      }

      await context.close();
    }
  },

  {
    id: 3,
    name: 'layout',
    async run(browser, baseUrl) {
      const viewports = [
        { width: 1100, height: 650 },
        { width: 1600, height: 940 },
        { width: 1920, height: 1080 }
      ];

      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: vp });
        await setupFakeBridge(context, true);
        await context.addInitScript(() => {
          localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
        });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/index.html?wctest&fast`);
        await waitSettled(page);

        const check = await page.evaluate(() => {
          const topBar = document.querySelector('.top-bar');
          const tbRect = topBar.getBoundingClientRect();
          const tbHeightRatio = tbRect.height / window.innerHeight;

          const noHScroll = document.documentElement.scrollWidth <= window.innerWidth;

          const buttons = Array.from(document.querySelectorAll('.top-bar button'));
          const outOfBoundsBtn = buttons.find(b => {
            const r = b.getBoundingClientRect();
            return r.left < 0 || r.right > window.innerWidth + 1 || r.top < 0 || r.bottom > window.innerHeight;
          });

          const footer = document.querySelector('.cathedral-footer');
          const footerRect = footer ? footer.getBoundingClientRect() : null;
          const footerOnScreen = footerRect ? (footerRect.top >= 0 && footerRect.bottom <= window.innerHeight + 1) : true;

          const chronicle = document.querySelector('.ledger-title');
          const chronicleRect = chronicle ? chronicle.getBoundingClientRect() : null;
          const chronicleOnScreen = chronicleRect ? (
            chronicleRect.left >= 0 && chronicleRect.right <= window.innerWidth + 1 &&
            chronicleRect.top >= 0 && chronicleRect.bottom <= window.innerHeight
          ) : true;

          return {
            tbHeightRatio,
            noHScroll,
            outOfBoundsBtn: outOfBoundsBtn ? outOfBoundsBtn.textContent.trim() : null,
            footerOnScreen,
            chronicleOnScreen
          };
        });

        if (check.tbHeightRatio > 0.35) {
          throw new Error(`Viewport ${vp.width}x${vp.height}: toolbar height ratio is ${(check.tbHeightRatio * 100).toFixed(1)}% (>35%)`);
        }
        if (!check.noHScroll) {
          throw new Error(`Viewport ${vp.width}x${vp.height}: horizontal scroll detected`);
        }
        if (check.outOfBoundsBtn) {
          throw new Error(`Viewport ${vp.width}x${vp.height}: button '${check.outOfBoundsBtn}' is out of window bounds`);
        }
        if (!check.footerOnScreen) {
          throw new Error(`Viewport ${vp.width}x${vp.height}: footer is not fully on screen`);
        }
        if (!check.chronicleOnScreen) {
          throw new Error(`Viewport ${vp.width}x${vp.height}: Move Chronicle panel is not on screen`);
        }

        await context.close();
      }
    }
  },

  {
    id: 4,
    name: 'mouse_moves',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Select 2P mode
      await page.click('button[data-depth="0"]');

      // Click e2 selects, targets e3/e4
      await clickSquare(page, 'e2');
      const e2State = await page.evaluate(() => ({
        sel: window.state.selectedSq,
        valid: window.state.validMoves.map(m => m.to)
      }));
      if (e2State.sel !== 'e2') throw new Error(`Expected selectedSq e2, got ${e2State.sel}`);
      if (!e2State.valid.includes('e3') || !e2State.valid.includes('e4')) {
        throw new Error(`Expected valid moves e3, e4 for e2, got ${e2State.valid.join(', ')}`);
      }

      // Click empty square deselects
      await clickSquare(page, 'd4');
      const deselected = await page.evaluate(() => window.state.selectedSq);
      if (deselected !== null) throw new Error(`Clicking empty square did not deselect: selectedSq=${deselected}`);

      // e2-e4 plays
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      // Ledger shows e4
      const ledgerText = await page.evaluate(() => document.getElementById('ledger-list')?.textContent || '');
      if (!ledgerText.includes('e4')) throw new Error(`Move e4 not found in ledger: ${ledgerText}`);

      // Turn passes to Black
      const turnAfterE4 = await page.evaluate(() => window.state.game.turn());
      if (turnAfterE4 !== 'b') throw new Error(`Expected turn 'b', got '${turnAfterE4}'`);

      // Selecting other side's piece does nothing
      await clickSquare(page, 'd2');
      const selOther = await page.evaluate(() => window.state.selectedSq);
      if (selOther !== null) throw new Error(`Selecting White piece on Black's turn set selectedSq to ${selOther}`);

      // e7-e5 plays
      await clickSquare(page, 'e7');
      await clickSquare(page, 'e5');
      await waitSettled(page);

      // Nf3 plays (g1-f3)
      await clickSquare(page, 'g1');
      await clickSquare(page, 'f3');
      await waitSettled(page);

      const plyCount = await page.evaluate(() => window.state.game.history().length);
      if (plyCount !== 3) throw new Error(`Expected 3 plies played, got ${plyCount}`);

      await context.close();
    }
  },

  {
    id: 5,
    name: 'ai_reply',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Default Adept (depth 2). White plays e2-e4.
      await page.evaluate(() => { window.__fakeBridge.calls = []; });
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      const calls1 = await page.evaluate(() => window.__fakeBridge.calls);
      const aiCall1 = calls1.find(c => c.type === 'ai_move');
      if (!aiCall1) throw new Error('AI bridge was not called after human move');
      if (aiCall1.depth !== 2) throw new Error(`Expected depth 2, got ${aiCall1.depth}`);
      if (!Array.isArray(aiCall1.history) || !aiCall1.history.includes('e2e4')) {
        throw new Error(`Expected history with e2e4, got ${JSON.stringify(aiCall1.history)}`);
      }
      if (aiCall1.startFen !== null) throw new Error(`Expected startFen null, got ${aiCall1.startFen}`);

      // Reply is played
      const pCount1 = await page.evaluate(() => window.state.game.history().length);
      if (pCount1 !== 2) throw new Error(`Expected 2 plies after AI reply, got ${pCount1}`);

      // Novice chip sends depth 1
      await page.click('#ai-group button[data-depth="1"]');
      await page.evaluate(() => { window.__fakeBridge.calls = []; });
      await clickSquare(page, 'd2');
      await clickSquare(page, 'd4');
      await waitSettled(page);

      const callsNovice = await page.evaluate(() => window.__fakeBridge.calls);
      const aiNovice = callsNovice.find(c => c.type === 'ai_move');
      if (!aiNovice || aiNovice.depth !== 1) {
        throw new Error(`Expected Novice chip to send depth 1, got ${aiNovice?.depth}`);
      }

      // Master chip sends depth 3
      await page.click('#ai-group button[data-depth="3"]');
      await page.evaluate(() => { window.__fakeBridge.calls = []; });
      await clickSquare(page, 'c2');
      await clickSquare(page, 'c4');
      await waitSettled(page);

      const callsMaster = await page.evaluate(() => window.__fakeBridge.calls);
      const aiMaster = callsMaster.find(c => c.type === 'ai_move');
      if (!aiMaster || aiMaster.depth !== 3) {
        throw new Error(`Expected Master chip to send depth 3, got ${aiMaster?.depth}`);
      }

      await context.close();
    }
  },

  {
    id: 6,
    name: 'ai_failures',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      const failureModes = ['throw', 'null', 'illegal'];
      for (const m of failureModes) {
        await page.click('#btn-reset');
        await waitSettled(page);
        await page.evaluate(mode => window.__fakeBridge.setMode(mode), m);

        await clickSquare(page, 'e2');
        await clickSquare(page, 'e4');
        await waitSettled(page);

        const check = await page.evaluate(() => ({
          turn: window.state.game.turn(),
          plies: window.state.game.history().length,
          toasts: document.querySelector('.toast-container')?.textContent || ''
        }));

        if (check.plies !== 2 || check.turn !== 'w') {
          throw new Error(`Mode '${m}' did not produce legal reply: plies=${check.plies}, turn=${check.turn}`);
        }
        if (!check.toasts.includes('fell back')) {
          throw new Error(`Mode '${m}' did not produce toast containing 'fell back': ${check.toasts}`);
        }
      }

      await context.close();

      // No-bridge page
      const noBridgeContext = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await noBridgeContext.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const noBridgePage = await noBridgeContext.newPage();
      await noBridgePage.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(noBridgePage);

      await clickSquare(noBridgePage, 'e2');
      await clickSquare(noBridgePage, 'e4');
      await waitSettled(noBridgePage);

      const noBridgeCheck = await noBridgePage.evaluate(() => ({
        turn: window.state.game.turn(),
        plies: window.state.game.history().length
      }));
      if (noBridgeCheck.plies !== 2 || noBridgeCheck.turn !== 'w') {
        throw new Error(`No-bridge page failed to reply: plies=${noBridgeCheck.plies}, turn=${noBridgeCheck.turn}`);
      }
      await noBridgeContext.close();
    }
  },

  {
    id: 7,
    name: 'stale_ai_reply',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // 1. Reset while AI is thinking
      await page.evaluate(() => window.__fakeBridge.setDelay(3500));
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await page.waitForFunction(() => !window.state.isAnimating);

      const genBeforeReset = await page.evaluate(() => window.state.gen);
      await page.click('#btn-reset');
      const genAfterReset = await page.evaluate(() => window.state.gen);
      if (genAfterReset <= genBeforeReset) {
        throw new Error(`resetGame did not increment state.gen: ${genBeforeReset} -> ${genAfterReset}`);
      }
      // Wait for the delayed bridge response to arrive
      await page.waitForTimeout(4000);
      await waitSettled(page);

      const checkReset = await page.evaluate(() => ({
        historyLen: window.state.game.history().length,
        fen: window.state.game.fen()
      }));
      if (checkReset.historyLen !== 0) throw new Error(`Reset was corrupted by stale AI reply: history=${checkReset.historyLen}`);
      if (checkReset.fen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        throw new Error(`Board not in start position after reset with stale AI: ${checkReset.fen}`);
      }

      // 2. Undo (Z) while AI is thinking
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await page.waitForFunction(() => !window.state.isAnimating);

      await page.keyboard.press('z');
      await page.waitForTimeout(4000);
      await waitSettled(page);

      const checkUndo = await page.evaluate(() => ({
        historyLen: window.state.game.history().length,
        fen: window.state.game.fen()
      }));
      if (checkUndo.historyLen !== 0) throw new Error(`Undo was corrupted by stale AI reply: history=${checkUndo.historyLen}`);
      if (checkUndo.fen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        throw new Error(`Board not in start position after undo with stale AI: ${checkUndo.fen}`);
      }

      await context.close();
    }
  },

  {
    id: 8,
    name: 'play_black',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Click Black chip
      await page.click('#side-group button[data-side="b"]');
      await waitSettled(page);

      // AI makes White's first move
      const plies1 = await page.evaluate(() => window.state.game.history().length);
      if (plies1 !== 1) throw new Error(`Expected AI to make 1 move after choosing Black, got ${plies1}`);

      // Camera yaw about pi
      const yaw = await page.evaluate(() => Math.abs(window.state.targetYaw));
      if (Math.abs(yaw - Math.PI) > 0.25) {
        throw new Error(`Expected camera yaw close to pi (~3.14), got ${yaw}`);
      }

      // Human can play Black (e7-e5) and AI answers
      await clickSquare(page, 'e7');
      await clickSquare(page, 'e5');
      await waitSettled(page);

      const plies2 = await page.evaluate(() => ({
        count: window.state.game.history().length,
        turn: window.state.game.turn()
      }));
      if (plies2.count !== 3) throw new Error(`Expected 3 plies after Black move and AI answer, got ${plies2.count}`);
      if (plies2.turn !== 'b') throw new Error(`Expected turn to be 'b' after AI reply, got '${plies2.turn}'`);

      await context.close();
    }
  },

  {
    id: 9,
    name: 'rules_through_real_clicks',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // 1. Castling kingside (king g1, rook f1)
      await page.click('button[data-depth="0"]'); // 2P mode
      const parityOk = await page.evaluate(() => {
        const a1 = window.state.squareMeshes['a1']?.userData?.isLight;
        const h1 = window.state.squareMeshes['h1']?.userData?.isLight;
        return a1 === false && h1 === true;
      });
      if (!parityOk) throw new Error('Board parity invariant violated: a1 must be dark and h1 must be light');

      await page.evaluate(() => window.importFen('r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPPBPPP/RNBQK2R w KQkq - 4 4'));
      await waitSettled(page);

      await clickSquare(page, 'e1');
      await clickSquare(page, 'g1');
      await waitSettled(page);

      const castleCheck = await page.evaluate(() => ({
        k: window.state.pieceMeshes['g1']?.userData?.type,
        r: window.state.pieceMeshes['f1']?.userData?.type
      }));
      if (castleCheck.k !== 'k' || castleCheck.r !== 'r') {
        throw new Error(`Castling failed: king on g1 is '${castleCheck.k}', rook on f1 is '${castleCheck.r}'`);
      }

      // 2. En passant (captured pawn gone from board and 3D scene)
      await page.evaluate(() => window.importFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'));
      await waitSettled(page);

      await clickSquare(page, 'e5');
      await clickSquare(page, 'f6');
      await waitSettled(page);

      const epCheck = await page.evaluate(() => ({
        gamePawn: window.state.game.get('f5'),
        meshPawn: window.state.pieceMeshes['f5']
      }));
      if (epCheck.gamePawn !== null) throw new Error('En passant target f5 still present in game state');
      if (epCheck.meshPawn !== undefined) throw new Error('En passant target f5 still present in 3D scene pieceMeshes');

      // 3. Human promotion opens #promo-modal and Knight promotes
      await page.evaluate(() => window.importFen('8/4P3/8/8/8/8/8/4K2k w - - 0 1'));
      await waitSettled(page);

      await clickSquare(page, 'e7');
      await clickSquare(page, 'e8');

      await page.waitForSelector('#promo-modal.visible', { timeout: 5000 });
      await page.click('#promo-modal .promo-btn[data-promo="n"]');
      await waitSettled(page);

      const promoCheck = await page.evaluate(() => window.state.game.get('e8')?.type);
      if (promoCheck !== 'n') throw new Error(`Expected Knight promotion, got '${promoCheck}'`);

      // 4. AI promotion shows no dialog
      await page.evaluate(() => {
        window.state.humanColor = 'b';
        window.__fakeBridge.setMode('fixed', { from: 'e7', to: 'e8', promotion: 'q' });
        window.importFen('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
      });
      await waitSettled(page);

      const aiPromoModal = await page.evaluate(() => document.getElementById('promo-modal').classList.contains('visible'));
      if (aiPromoModal) throw new Error('Promotion dialog opened on AI promotion move');

      // 5. Fool's mate shows CHECKMATE; modal Undo Last, Close, Play New Match; board locked after mate
      await page.click('#side-group button[data-side="w"]');
      await page.click('button[data-depth="0"]'); // 2P mode
      await page.click('#btn-reset');
      await waitSettled(page);

      // 1. f3 e5 2. g4 Qh4#
      await clickSquare(page, 'f2'); await clickSquare(page, 'f3'); await waitSettled(page);
      await clickSquare(page, 'e7'); await clickSquare(page, 'e5'); await waitSettled(page);
      await clickSquare(page, 'g2'); await clickSquare(page, 'g4'); await waitSettled(page);
      await clickSquare(page, 'd8'); await clickSquare(page, 'h4'); await waitSettled(page);

      await page.waitForSelector('#end-modal.visible', { timeout: 5000 });
      const mateTitle = await page.evaluate(() => document.getElementById('modal-title')?.textContent);
      if (mateTitle !== 'CHECKMATE') throw new Error(`Expected modal title CHECKMATE, got '${mateTitle}'`);

      // Board is locked after mate
      await clickSquare(page, 'a2');
      const lockedSel = await page.evaluate(() => window.state.selectedSq);
      if (lockedSel !== null) throw new Error(`Board was not locked after checkmate: selectedSq=${lockedSel}`);

      // Modal Undo Last works
      await page.click('#modal-btn-undo');
      await waitSettled(page);
      const afterUndoHistory = await page.evaluate(() => window.state.game.history().length);
      if (afterUndoHistory !== 3) throw new Error(`Undo Last in modal did not undo mate move: plies=${afterUndoHistory}`);

      // Re-deliver mate
      await clickSquare(page, 'd8'); await clickSquare(page, 'h4'); await waitSettled(page);
      await page.waitForSelector('#end-modal.visible');
      // Modal Close works
      await page.click('#modal-btn-close');
      const modalClosed = await page.evaluate(() => !document.getElementById('end-modal').classList.contains('visible'));
      if (!modalClosed) throw new Error('Close button did not dismiss end modal');

      // 6. Stalemate shows MATCH DRAWN with STALEMATE
      await page.evaluate(() => window.importFen('k7/8/2K5/8/8/8/8/1Q6 w - - 0 1'));
      await waitSettled(page);
      await clickSquare(page, 'b1');
      await clickSquare(page, 'b6');
      await waitSettled(page);

      await page.waitForSelector('#end-modal.visible');
      const staleCheck = await page.evaluate(() => ({
        title: document.getElementById('modal-title')?.textContent,
        status: document.getElementById('status-text')?.textContent
      }));
      if (staleCheck.title !== 'MATCH DRAWN') throw new Error(`Expected MATCH DRAWN for stalemate, got '${staleCheck.title}'`);
      if (!staleCheck.status.includes('STALEMATE')) {
        throw new Error(`Expected status text to include STALEMATE, got '${staleCheck.status}'`);
      }

      await context.close();
    }
  },

  {
    id: 10,
    name: 'match_controls',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // 1. Resign vs AI shows RESIGNATION and locks board
      await page.click('#btn-resign');
      await page.waitForSelector('#end-modal.visible');
      const resignTitle = await page.evaluate(() => document.getElementById('modal-title')?.textContent);
      if (resignTitle !== 'RESIGNATION') throw new Error(`Expected RESIGNATION title, got '${resignTitle}'`);
      await clickSquare(page, 'e2');
      const selResigned = await page.evaluate(() => window.state.selectedSq);
      if (selResigned !== null) throw new Error('Board was not locked after resignation');

      // 2. AI declines early draw offer
      await page.click('#modal-btn-reset');
      await waitSettled(page);
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      await page.click('#btn-draw');
      await page.waitForSelector('.toast-container .toast', { timeout: 5000 });
      const drawToast = await page.evaluate(() => document.querySelector('.toast-container')?.textContent || '');
      if (!drawToast.includes('declines')) throw new Error(`Expected AI decline toast, got: ${drawToast}`);

      // 3. Two-player draw accepted (DRAW AGREED)
      await page.click('button[data-depth="0"]');
      await page.click('#btn-draw');
      await page.waitForSelector('#end-modal.visible');
      const drawTitle = await page.evaluate(() => document.getElementById('modal-title')?.textContent);
      if (drawTitle !== 'DRAW AGREED') throw new Error(`Expected DRAW AGREED in 2P mode, got '${drawTitle}'`);

      // 4. Two-player Resign makes side to move lose
      await page.click('#modal-btn-reset');
      await waitSettled(page);
      // Play 1. e4 (turn is now Black)
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      await page.click('#btn-resign');
      await page.waitForSelector('#end-modal.visible');
      const tpResignStatus = await page.evaluate(() => document.getElementById('status-text')?.textContent || '');
      if (!tpResignStatus.includes('MARBLE ORDER WINS')) {
        throw new Error(`Expected White to win when Black resigns in 2P mode, got '${tpResignStatus}'`);
      }

      await context.close();
    }
  },

  {
    id: 11,
    name: 'clocks',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Select 5m clock
      await page.click('#time-group button[data-time="300"]');
      const clockInit = await page.evaluate(() => ({
        w: document.getElementById('clock-white')?.textContent,
        b: document.getElementById('clock-black')?.textContent
      }));
      if (clockInit.w !== '05:00' || clockInit.b !== '05:00') {
        throw new Error(`Expected 05:00 on both clocks, got White='${clockInit.w}', Black='${clockInit.b}'`);
      }

      // Clock idle before first move
      await page.evaluate(() => window.tickClock(30));
      const clockIdle = await page.evaluate(() => ({
        w: document.getElementById('clock-white')?.textContent,
        b: document.getElementById('clock-black')?.textContent
      }));
      if (clockIdle.w !== '05:00' || clockIdle.b !== '05:00') {
        throw new Error(`Clock ticked before first move: White='${clockIdle.w}', Black='${clockIdle.b}'`);
      }

      // Switch to 2P mode and play e4
      await page.click('button[data-depth="0"]');
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      // tickClock(30) -> Black shows 04:30, White untouched (05:00)
      await page.evaluate(() => window.tickClock(30));
      const clockTicked = await page.evaluate(() => ({
        w: document.getElementById('clock-white')?.textContent,
        b: document.getElementById('clock-black')?.textContent
      }));
      if (clockTicked.w !== '05:00' || clockTicked.b !== '04:30') {
        throw new Error(`Expected White 05:00, Black 04:30, got White='${clockTicked.w}', Black='${clockTicked.b}'`);
      }

      // tickClock(1000) gives TIME EXPIRED, White wins
      await page.evaluate(() => window.tickClock(1000));
      await page.waitForSelector('#end-modal.visible');
      const clockEnd = await page.evaluate(() => ({
        title: document.getElementById('modal-title')?.textContent,
        status: document.getElementById('status-text')?.textContent
      }));
      if (clockEnd.title !== 'TIME EXPIRED') throw new Error(`Expected title TIME EXPIRED, got '${clockEnd.title}'`);
      if (!clockEnd.status.includes('MARBLE ORDER WINS')) {
        throw new Error(`Expected White to win on time, got status: '${clockEnd.status}'`);
      }

      await context.close();
    }
  },

  {
    id: 12,
    name: 'pgn_fen_dialog',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // 2P mode, play e4
      await page.click('button[data-depth="0"]');
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      // Open PGN/FEN dialog
      await page.click('#btn-io');
      await page.waitForSelector('#io-modal.visible');

      // Export FEN equals current FEN
      await page.click('#btn-export-fen');
      const fenVal = await page.evaluate(() => ({
        area: document.getElementById('io-textarea')?.value,
        fen: window.state.game.fen()
      }));
      if (fenVal.area !== fenVal.fen) throw new Error(`Export FEN did not match current FEN: '${fenVal.area}' vs '${fenVal.fen}'`);

      // Export PGN contains 1. e4
      await page.click('#btn-export-pgn');
      const pgnVal = await page.evaluate(() => document.getElementById('io-textarea')?.value || '');
      if (!pgnVal.includes('1. e4')) throw new Error(`Export PGN missing '1. e4': ${pgnVal}`);

      // Bad input tests (leave game unchanged, show toast)
      const badInputs = [
        'not a fen',
        '8/8/8/8/8/8/8/4K3 w - - 0 1', // no black king
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNK w KQkq - 0 1' // two white kings
      ];

      for (const bad of badInputs) {
        await page.fill('#io-textarea', bad);
        await page.click('#btn-import-fen');
        const errToast = await page.evaluate(() => document.querySelector('.toast-container')?.textContent || '');
        if (!errToast.includes('Invalid') && !errToast.includes('invalid') && !errToast.includes('king')) {
          throw new Error(`Bad FEN '${bad}' did not trigger error toast: ${errToast}`);
        }
        const fenAfterBad = await page.evaluate(() => window.state.game.fen());
        if (fenAfterBad !== fenVal.fen) throw new Error(`Bad FEN '${bad}' mutated the game state!`);
      }

      // Good FEN loads, closes dialog and sets state.startFen
      const goodFen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
      await page.fill('#io-textarea', goodFen);
      await page.click('#btn-import-fen');
      await page.waitForTimeout(300);

      const goodCheck = await page.evaluate(() => ({
        modalVisible: document.getElementById('io-modal')?.classList.contains('visible'),
        fen: window.state.game.fen(),
        startFen: window.state.startFen
      }));
      if (goodCheck.modalVisible) throw new Error('Dialog did not close on successful FEN import');
      if (goodCheck.fen !== goodFen) throw new Error(`Game FEN did not match imported FEN: ${goodCheck.fen}`);
      if (goodCheck.startFen !== goodFen) throw new Error(`state.startFen was not set to imported FEN: ${goodCheck.startFen}`);

      await context.close();
    }
  },

  {
    id: 13,
    name: 'replay',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Play 4 moves in 2P mode: 1. e4 e5 2. Nf3 Nc6
      await page.click('button[data-depth="0"]');
      await clickSquare(page, 'e2'); await clickSquare(page, 'e4'); await waitSettled(page);
      await clickSquare(page, 'e7'); await clickSquare(page, 'e5'); await waitSettled(page);
      await clickSquare(page, 'g1'); await clickSquare(page, 'f3'); await waitSettled(page);
      await clickSquare(page, 'b8'); await clickSquare(page, 'c6'); await waitSettled(page);

      const fullHistory = await page.evaluate(() => window.state.game.history());
      if (fullHistory.length !== 4) throw new Error(`Expected 4 moves, got ${fullHistory.length}`);

      // ArrowLeft shows earlier position
      await page.keyboard.press('ArrowLeft');
      const plyLeft1 = await page.evaluate(() => window.state.replayPly);
      if (plyLeft1 !== 2) throw new Error(`Expected replayPly 2 after ArrowLeft, got ${plyLeft1}`);

      // Clicking a ledger move jumps
      await page.click('.ledger-san[data-ply="1"]');
      const plyJump = await page.evaluate(() => window.state.replayPly);
      if (plyJump !== 1) throw new Error(`Expected replayPly 1 after clicking ledger ply 1, got ${plyJump}`);

      // ArrowRight steps forward
      await page.keyboard.press('ArrowRight');
      const plyRight = await page.evaluate(() => window.state.replayPly);
      if (plyRight !== 2) throw new Error(`Expected replayPly 2 after ArrowRight, got ${plyRight}`);

      // Clicking the board returns to live play
      await clickSquare(page, 'e4');
      const livePly = await page.evaluate(() => window.state.replayPly);
      if (livePly !== null) throw new Error(`Clicking board did not return to live play: replayPly=${livePly}`);

      // History never changed
      const histAfter = await page.evaluate(() => window.state.game.history());
      if (histAfter.length !== 4 || JSON.stringify(histAfter) !== JSON.stringify(fullHistory)) {
        throw new Error('History was altered during replay mode');
      }

      await context.close();
    }
  },

  {
    id: 14,
    name: 'hotkeys_and_camera',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Space flips camera by pi
      const initYaw = await page.evaluate(() => window.state.targetYaw);
      await page.keyboard.press('Space');
      const flippedYaw = await page.evaluate(() => window.state.targetYaw);
      if (Math.abs(Math.abs(flippedYaw - initYaw) - Math.PI) > 0.15) {
        throw new Error(`Space did not flip yaw by pi: init=${initYaw}, flipped=${flippedYaw}`);
      }

      // 1 and 3 presets (pitch 0.66 and 1.44)
      await page.keyboard.press('Digit1');
      const p1 = await page.evaluate(() => window.state.targetPitch);
      if (Math.abs(p1 - 0.66) > 0.05) throw new Error(`Preset 1 pitch expected 0.66, got ${p1}`);

      await page.keyboard.press('Digit3');
      const p3 = await page.evaluate(() => window.state.targetPitch);
      if (Math.abs(p3 - 1.44) > 0.05) throw new Error(`Preset 3 pitch expected 1.44, got ${p3}`);

      // Wheel zooms
      const initDist = await page.evaluate(() => window.state.targetDist);
      await page.mouse.move(500, 500);
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(100);
      const zoomedDist = await page.evaluate(() => window.state.targetDist);
      if (zoomedDist === initDist) throw new Error('Mouse wheel did not modify targetDist');

      // Right-drag orbits
      const yawBeforeRDrag = await page.evaluate(() => window.state.targetYaw);
      await page.mouse.move(500, 500);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(650, 500);
      await page.mouse.up({ button: 'right' });
      const yawAfterRDrag = await page.evaluate(() => window.state.targetYaw);
      if (yawBeforeRDrag === yawAfterRDrag) throw new Error('Right-drag did not orbit camera');

      // Left-drag orbits without selecting
      await page.mouse.move(50, 500);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(180, 500);
      await page.mouse.up({ button: 'left' });
      const selAfterLDrag = await page.evaluate(() => window.state.selectedSq);
      if (selAfterLDrag !== null) throw new Error(`Left-drag selected a square: ${selAfterLDrag}`);

      // Play a move in 2P mode so history > 0, requiring confirmation to reset
      await page.click('button[data-depth="0"]');
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);

      // R needs second press (status PRESS R AGAIN TO RESET)
      await page.keyboard.press('KeyR');
      const rPrompt = await page.evaluate(() => document.getElementById('status-text')?.textContent || '');
      if (!rPrompt.includes('PRESS R AGAIN TO RESET')) {
        throw new Error(`First R press did not show arm prompt: '${rPrompt}'`);
      }
      await page.keyboard.press('KeyR');
      await waitSettled(page);
      const rResetStatus = await page.evaluate(() => document.getElementById('status-text')?.textContent || '');
      if (rResetStatus.includes('PRESS R AGAIN TO RESET')) {
        throw new Error('Second R press failed to reset game');
      }

      // Play move again, then Z undoes
      await clickSquare(page, 'e2');
      await clickSquare(page, 'e4');
      await waitSettled(page);
      await page.keyboard.press('z');
      await waitSettled(page);
      const afterZHistory = await page.evaluate(() => window.state.game.history().length);
      if (afterZHistory !== 0) throw new Error(`Key Z failed to undo move: history=${afterZHistory}`);

      // M toggles mute icon
      const muteBefore = await page.evaluate(() => document.getElementById('mute-btn')?.textContent);
      await page.keyboard.press('KeyM');
      const muteAfter = await page.evaluate(() => document.getElementById('mute-btn')?.textContent);
      if (muteBefore === muteAfter) throw new Error('Key M did not toggle mute button icon');

      // Space after clicking toolbar button does not trigger that button
      const hintCallsBefore = await page.evaluate(() => window.__fakeBridge.calls.filter(c => c.type === 'hint').length);
      await page.click('#btn-hint');
      await page.waitForTimeout(200);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const hintCallsAfter = await page.evaluate(() => window.__fakeBridge.calls.filter(c => c.type === 'hint').length);
      if (hintCallsAfter > hintCallsBefore + 1) {
        throw new Error('Space key repeated the focused toolbar button click');
      }

      await context.close();
    }
  },

  {
    id: 15,
    name: 'hint_and_fullscreen',
    async run(browser, baseUrl) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      await context.addInitScript(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ shadowHigh: false }));
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Fixed hint move g1-f3
      await page.evaluate(() => window.__fakeBridge.setMode('fixed', { from: 'g1', to: 'f3' }));
      await page.click('#btn-hint');
      await page.waitForTimeout(300);

      const hintState = await page.evaluate(() => ({
        sel: window.state.selectedSq,
        hint: window.state.hintMove
      }));
      if (hintState.sel !== 'g1') throw new Error(`Hint did not select from square: got '${hintState.sel}', expected 'g1'`);
      if (!hintState.hint || hintState.hint.to !== 'f3') {
        throw new Error(`Hint destination expected f3, got ${JSON.stringify(hintState.hint)}`);
      }

      // Fullscreen button calls toggle_fullscreen on bridge
      await page.click('#btn-fullscreen');
      const fsCalls = await page.evaluate(() => window.__fakeBridge.fullscreenCalls);
      if (fsCalls < 1) throw new Error('Fullscreen button did not invoke bridge toggle_fullscreen');

      await context.close();
    }
  },

  {
    id: 16,
    name: 'settings',
    async run(browser, baseUrl) {
      // Must start with clean storage (no pre-seeded shadowHigh)
      const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await setupFakeBridge(context, true);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/index.html?wctest&fast`);
      await waitSettled(page);

      // Change level to Master (depth 3)
      await page.click('#ai-group button[data-depth="3"]');
      // Change shadows
      await page.click('#quality-btn');
      // Change mute
      await page.click('#mute-btn');

      const savedBeforeReload = await page.evaluate(() => ({
        depth: window.state.aiDepth,
        shadow: window.state.shadowHigh,
        muteIcon: document.getElementById('mute-btn')?.textContent
      }));

      // Reload
      await page.reload();
      await waitSettled(page);

      const restored = await page.evaluate(() => ({
        depth: window.state.aiDepth,
        activeDepthChip: document.querySelector('#ai-group button.active')?.dataset?.depth,
        shadow: window.state.shadowHigh,
        muteIcon: document.getElementById('mute-btn')?.textContent
      }));

      if (restored.depth !== savedBeforeReload.depth) {
        throw new Error(`aiDepth not restored: saved=${savedBeforeReload.depth}, restored=${restored.depth}`);
      }
      if (restored.activeDepthChip !== '3') {
        throw new Error(`Active depth chip not restored: expected '3', got '${restored.activeDepthChip}'`);
      }
      if (restored.shadow !== savedBeforeReload.shadow) {
        throw new Error(`shadowHigh not restored: saved=${savedBeforeReload.shadow}, restored=${restored.shadow}`);
      }
      if (restored.muteIcon !== savedBeforeReload.muteIcon) {
        throw new Error(`Mute state not restored: saved='${savedBeforeReload.muteIcon}', restored='${restored.muteIcon}'`);
      }

      // Corrupt saved settings: invalid values and malformed JSON
      await page.evaluate(() => {
        localStorage.setItem('wizards_chess_settings', JSON.stringify({ aiDepth: 'DROP TABLE', shadowHigh: 'MALICIOUS' }));
      });
      await page.reload();
      await waitSettled(page);
      const fallback1 = await page.evaluate(() => window.state.aiDepth);
      if (fallback1 !== 2) throw new Error(`Corrupt values did not fall back to default depth 2: got ${fallback1}`);

      await page.evaluate(() => {
        localStorage.setItem('wizards_chess_settings', '{invalid json syntax');
      });
      await page.reload();
      await waitSettled(page);
      const fallback2 = await page.evaluate(() => window.state.aiDepth);
      if (fallback2 !== 2) throw new Error(`Unparsable JSON did not fall back to default depth 2: got ${fallback2}`);

      await context.close();
    }
  }
];

// ----------------------------------------------------------------------------
// MAIN EXECUTION ENGINE
// ----------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Wizard's Chess E2E Test Suite`);
  console.log(`Flags: headed=${IS_HEADED}, slowmo=${SLOWMO}, python=${RUN_PYTHON}, real-app=${RUN_REAL_APP}`);
  if (ONLY) console.log(`Only running scenarios matching: ${ONLY}`);

  let staticServer = null;
  let baseUrl = BASE_URL_OVERRIDE;
  if (!baseUrl) {
    staticServer = await startStaticServer(path.join(ROOT, 'web'));
    baseUrl = `http://127.0.0.1:${staticServer.address().port}`;
    console.log(`Started internal static server on ${baseUrl}`);
  }

  const launchOptions = {
    headless: !IS_HEADED,
    slowMo: SLOWMO,
    args: CHROMIUM_FLAGS
  };
  if (process.env.CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.CHROMIUM_PATH;
  }

  const browser = await chromium.launch(launchOptions);

  // Filter scenarios if --only is passed
  let scenariosToRun = SCENARIOS;
  if (ONLY) {
    const filters = ONLY.split(',').map(s => s.trim().toLowerCase());
    scenariosToRun = SCENARIOS.filter(s =>
      filters.includes(String(s.id)) || filters.some(f => s.name.toLowerCase().includes(f))
    );
  }

  const results = [];
  const startTime = Date.now();
  let anyFailed = false;

  for (const sc of scenariosToRun) {
    process.stdout.write(`Scenario ${sc.id.toString().padStart(2, '0')}: ${sc.name.padEnd(28, ' ')} ... `);
    const scStart = Date.now();
    let status = 'PASS';
    let errorMsg = null;
    let screenshotPath = null;

    try {
      await sc.run(browser, baseUrl);
      console.log('PASS');
    } catch (err) {
      status = 'FAIL';
      anyFailed = true;
      errorMsg = err.message || String(err);
      console.log(`FAIL\n    -> ${errorMsg}`);

      // Try capturing a failure screenshot if a page is open
      try {
        const contexts = browser.contexts();
        if (contexts.length > 0) {
          const pages = contexts[0].pages();
          if (pages.length > 0) {
            const shotName = `scenario_${sc.id.toString().padStart(2, '0')}_${sc.name}_fail.png`;
            screenshotPath = path.join(OUTPUT_DIR, shotName);
            await pages[0].screenshot({ path: screenshotPath });
          }
        }
      } catch (_) {}
    } finally {
      // Ensure all browser contexts are cleanly closed between scenarios so no WebGL instances leak
      for (const ctx of browser.contexts()) {
        await ctx.close().catch(() => {});
      }
    }

    results.push({
      id: sc.id,
      name: sc.name,
      status,
      durationMs: Date.now() - scStart,
      error: errorMsg,
      screenshot: screenshotPath ? path.basename(screenshotPath) : null
    });
  }

  const totalDuration = Date.now() - startTime;

  // Real App verification if --real-app is passed
  let realAppResult = null;
  if (RUN_REAL_APP) {
    console.log('\n--- Real Desktop App Verification (python app.py) ---');
    try {
      const proc = spawn('python', ['app.py'], { cwd: ROOT });
      let stderrData = '';
      proc.stderr.on('data', d => { stderrData += d.toString(); });

      console.log('Waiting 12 seconds with real app window open...');
      await new Promise(r => setTimeout(r, 12000));

      if (proc.exitCode !== null) {
        throw new Error(`Real app exited prematurely with code ${proc.exitCode}. Stderr: ${stderrData}`);
      }
      // Clean shutdown
      proc.kill();
      realAppResult = { status: 'PASS', stderr: stderrData };
      console.log('Real desktop window remained open cleanly for 12 seconds (PASS)');
    } catch (e) {
      anyFailed = true;
      realAppResult = { status: 'FAIL', error: e.message };
      console.error('Real app check failed:', e.message);
    }
  }

  // Python unit tests and smoke test if --python is passed
  let pythonResult = null;
  if (RUN_PYTHON) {
    console.log('\n--- Python Unit & Smoke Tests ---');
    const smoke = spawnSync('python', ['app.py', '--smoke-test'], { cwd: ROOT, encoding: 'utf8' });
    const pytest = spawnSync('python', ['-m', 'pytest', 'tests', '-q'], { cwd: ROOT, encoding: 'utf8' });
    if (smoke.status !== 0 || pytest.status !== 0) {
      anyFailed = true;
      pythonResult = { status: 'FAIL', smoke: smoke.stdout + smoke.stderr, pytest: pytest.stdout + pytest.stderr };
      console.error('Python tests failed:', pythonResult);
    } else {
      pythonResult = { status: 'PASS' };
      console.log('Python smoke test & pytest passed (PASS)');
    }
  }

  // Write reports to tests/e2e_output/
  const reportJson = {
    total: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    totalDurationMs: totalDuration,
    results,
    realAppResult,
    pythonResult
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(reportJson, null, 2), 'utf8');

  let reportMd = `# E2E Test Flow Run Report\n\n`;
  reportMd += `- Date: ${new Date().toISOString()}\n`;
  reportMd += `- Scenarios: ${reportJson.passed}/${reportJson.total} passed\n`;
  reportMd += `- Duration: ${(totalDuration / 1000).toFixed(2)}s\n\n`;
  reportMd += `| # | Scenario | Status | Duration | Error |\n`;
  reportMd += `|---|---|---|---|---|\n`;
  for (const r of results) {
    reportMd += `| ${r.id} | ${r.name} | ${r.status} | ${(r.durationMs / 1000).toFixed(2)}s | ${r.error || ''} |\n`;
  }
  if (realAppResult) {
    reportMd += `\n### Real App Window Result: ${realAppResult.status}\n`;
  }
  if (pythonResult) {
    reportMd += `\n### Python Suite Result: ${pythonResult.status}\n`;
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.md'), reportMd, 'utf8');

  console.log(`\nReport written to ${path.join(OUTPUT_DIR, 'report.md')}`);

  if (!KEEP_OPEN) {
    await browser.close();
  }
  if (staticServer) {
    staticServer.close();
  }

  if (anyFailed) {
    console.error('\nE2E Suite had failures.');
    process.exit(1);
  } else {
    console.log('\nAll scenarios PASSED.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
