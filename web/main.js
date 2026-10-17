import { dom } from './dom.js';
import { state } from './state.js';
import { renderer, scene, camera } from './materials.js';
import { buildCathedral } from './cathedral.js';
import { initBoard, syncBoardFull, rebuildTacticalMarkers, spawnShatter } from './board.js';
import { buildPieceMesh } from './pieces.js';
import {
  initInput,
  triggerAI,
  showTacticalHint,
  handleSquareClick,
  selectPromotion,
  showPromotionDialog,
  hidePromotionDialog
} from './input.js';
import {
  updateHUD,
  applyShadowQuality,
  toggleQuality,
  toggleFull,
  toggleAudio,
  closeModal,
  openIoModal,
  closeIoModal
} from './hud.js';
import {
  setSide,
  undoMove,
  resetGame,
  exportFen,
  exportPgn,
  importFen,
  resignGame,
  offerDraw,
  setTimeControl,
  tickClock,
  formatClock,
  setReplayPly,
  stepReplay,
  getReplayGame
} from './commands.js';
import { initCameraControls, setCameraPreset, flipCamera } from './camera.js';
import { saveSettings, loadSettings, applyLoadedSettings } from './settings.js';
import { shortGpuName } from './gpu.js';

// ============================================================================
// GPU TELEMETRY DETECTION
// ============================================================================
try {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) {
    state.gpuName = shortGpuName(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
  }
} catch (_) {}

// ============================================================================
// MAIN ANIMATION & RENDER LOOP
// ============================================================================
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  const elapsed = now * 0.001;
  tickClock(dt);

  state.frameCount++;
  if (now - state.fpsStart >= 500) {
    const fps = Math.round((state.frameCount * 1000) / (now - state.fpsStart));
    if (dom.telemetry) {
      dom.telemetry.textContent = `${state.gpuName} • Shadows ${state.shadowHigh ? '4K' : '1.5K'} • ${fps} FPS`;
    }
    state.frameCount = 0;
    state.fpsStart = now;
  }

  // Animate Wrought-Iron Brazier Flames
  state.brazierLights.forEach(b => {
    b.light.intensity = 0.92 + Math.sin(elapsed * 9 + b.phase) * 0.14;
  });
  state.flameCones.forEach(fc => {
    const f = Math.sin(elapsed * 11 + fc.phase) * 0.18;
    fc.mesh.scale.set(1 + f * 0.3, 1 + f * 0.5, 1 + f * 0.3);
  });

  // Animate 3D Tactical Move Markers
  state.animatedMarkers.forEach(m => {
    m.mesh.rotation.y = elapsed * 2.6;
    if (m.type === 'quiet') {
      m.mesh.position.y = 0.16 + Math.sin(elapsed * 4.0) * 0.04;
    } else {
      m.mesh.position.y = 2.15 + Math.sin(elapsed * 5.0) * 0.08;
    }
  });

  // Update Move / Lunge Attack / Shatter Animation
  if (state.activeAnim) {
    state.activeAnim.elapsed += dt;
    const t = Math.min(1, state.activeAnim.elapsed / state.activeAnim.duration);
    const att = state.activeAnim.attacker;

    if (state.activeAnim.isCapture) {
      if (t < 0.25) {
        const w = t / 0.25;
        att.userData.bodyGroup.position.y = w * 0.45;
        att.userData.weaponGroup.rotation.x = -w * 0.8;
      } else {
        const st = (t - 0.25) / 0.75;
        const ease = 1 - Math.pow(1 - st, 3);
        att.position.lerpVectors(state.activeAnim.start, state.activeAnim.end, ease);
        att.userData.bodyGroup.position.y = Math.sin(st * Math.PI) * 0.55;
        att.userData.weaponGroup.rotation.x = -0.8 + Math.min(1, st * 1.6) * 1.9;

        if (st >= 0.58 && !state.activeAnim.shattered) {
          state.activeAnim.shattered = true;
          if (state.activeAnim.defender) {
            const dir = new THREE.Vector3().subVectors(state.activeAnim.end, state.activeAnim.start).normalize();
            spawnShatter(state.activeAnim.defender.position, state.activeAnim.defender.userData.colorChar, dir, scene);
            scene.remove(state.activeAnim.defender);
            delete state.pieceMeshes[state.activeAnim.capturedSq];
            state.shakeAmt = 0.35;
          }
        }
      }
    } else {
      const ease = t * t * (3 - 2 * t);
      att.position.lerpVectors(state.activeAnim.start, state.activeAnim.end, ease);
      att.userData.bodyGroup.position.y = Math.sin(t * Math.PI) * 0.35;
      if (state.activeAnim.rookAnim) {
        state.activeAnim.rookAnim.mesh.position.lerpVectors(
          state.activeAnim.rookAnim.start,
          state.activeAnim.rookAnim.end,
          ease
        );
      }
    }

    if (t >= 1) {
      const { moveObj } = state.activeAnim;
      delete state.pieceMeshes[moveObj.from];
      if (moveObj.promotion) {
        scene.remove(att);
        const promoted = buildPieceMesh(moveObj.promotion, moveObj.color);
        promoted.position.copy(state.activeAnim.end);
        promoted.userData.sq = moveObj.to;
        scene.add(promoted);
        state.pieceMeshes[moveObj.to] = promoted;
      } else {
        att.position.copy(state.activeAnim.end);
        att.userData.bodyGroup.position.y = 0;
        att.userData.weaponGroup.rotation.x = 0;
        att.userData.sq = moveObj.to;
        state.pieceMeshes[moveObj.to] = att;
      }
      state.activeAnim = null;
      state.isAnimating = false;
      rebuildTacticalMarkers();
      updateHUD();
      triggerAI();
    }
  }

  // Update Piece Idle Breathing & Levitation
  for (const sq in state.pieceMeshes) {
    const p = state.pieceMeshes[sq];
    if (state.activeAnim && p === state.activeAnim.attacker) continue;
    const ud = p.userData;
    const breath = Math.sin(elapsed * 2.4 + ud.phase) * 0.022;
    ud.bodyGroup.position.y = (sq === state.selectedSq ? 0.26 : 0) + Math.max(0, breath);
    ud.headGroup.rotation.y = Math.sin(elapsed * 1.5 + ud.phase) * 0.12;
    ud.weaponGroup.rotation.z = Math.cos(elapsed * 2.0 + ud.phase) * 0.06;
  }

  // Update Rigid-Body Shatter Shards
  for (let i = state.shards.length - 1; i >= 0; i--) {
    const s = state.shards[i];
    s.age += dt;
    if (s.age >= s.life) {
      scene.remove(s.mesh);
      state.shards.splice(i, 1);
      continue;
    }
    s.vel.y -= 15.5 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.rotation.x += s.rotVel.x * dt;
    s.mesh.rotation.y += s.rotVel.y * dt;
    if (s.mesh.position.y < 0.06) {
      s.mesh.position.y = 0.06;
      s.vel.y = Math.abs(s.vel.y) * 0.42;
      s.vel.x *= 0.72;
      s.vel.z *= 0.72;
    }
    const rem = s.life - s.age;
    if (rem < 0.5) s.mesh.scale.setScalar(Math.max(0.001, (rem / 0.5) * s.baseScale));
  }

  state.camYaw += (state.targetYaw - state.camYaw) * Math.min(1, dt * 8);
  state.camPitch += (state.targetPitch - state.camPitch) * Math.min(1, dt * 8);
  state.camDist += (state.targetDist - state.camDist) * Math.min(1, dt * 8);

  const cx = Math.sin(state.camYaw) * Math.cos(state.camPitch) * state.camDist;
  const cy = Math.sin(state.camPitch) * state.camDist;
  const cz = Math.cos(state.camYaw) * Math.cos(state.camPitch) * state.camDist;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  if (state.shakeAmt > 0) {
    state.shakeAmt = Math.max(0, state.shakeAmt - dt * 1.5);
    sx = (Math.random() - 0.5) * state.shakeAmt;
    sy = (Math.random() - 0.5) * state.shakeAmt;
    sz = (Math.random() - 0.5) * state.shakeAmt;
  }

  camera.position.set(cx + sx, cy + sy, cz + sz);
  camera.lookAt(sx, 0.55 + sy, sz);
  renderer.render(scene, camera);
}

// ============================================================================
// EVENT LISTENER BINDINGS (REPLACING INLINE ONCLICK HANDLERS)
// ============================================================================
function bindUIEvents() {
  if (dom.btnCamWhite) dom.btnCamWhite.addEventListener('click', () => setCameraPreset(1));
  if (dom.btnCamAngle) dom.btnCamAngle.addEventListener('click', () => setCameraPreset(2));
  if (dom.btnCamTop) dom.btnCamTop.addEventListener('click', () => setCameraPreset(3));
  if (dom.btnCamFlip) dom.btnCamFlip.addEventListener('click', flipCamera);

  if (dom.btnHint) dom.btnHint.addEventListener('click', showTacticalHint);
  if (dom.btnUndo) dom.btnUndo.addEventListener('click', undoMove);
  if (dom.btnReset) dom.btnReset.addEventListener('click', resetGame);
  if (dom.muteBtn) dom.muteBtn.addEventListener('click', toggleAudio);
  if (dom.qualityBtn) dom.qualityBtn.addEventListener('click', toggleQuality);
  if (dom.btnFullscreen) dom.btnFullscreen.addEventListener('click', toggleFull);

  if (dom.modalBtnReset) dom.modalBtnReset.addEventListener('click', resetGame);
  if (dom.modalBtnUndo) dom.modalBtnUndo.addEventListener('click', undoMove);
  if (dom.modalBtnClose) dom.modalBtnClose.addEventListener('click', closeModal);

  if (dom.btnDraw) dom.btnDraw.addEventListener('click', offerDraw);
  if (dom.btnResign) dom.btnResign.addEventListener('click', resignGame);
  if (dom.btnIo) dom.btnIo.addEventListener('click', openIoModal);
  if (dom.btnExportFen) dom.btnExportFen.addEventListener('click', exportFen);
  if (dom.btnExportPgn) dom.btnExportPgn.addEventListener('click', exportPgn);
  if (dom.btnImportFen) dom.btnImportFen.addEventListener('click', () => importFen());
  if (dom.btnIoClose) dom.btnIoClose.addEventListener('click', closeIoModal);

  document.querySelectorAll('#ai-group .md-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ai-group .md-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.aiDepth = parseInt(btn.dataset.depth, 10);
      saveSettings();
      triggerAI();
    });
  });

  document.querySelectorAll('#side-group .md-chip').forEach(btn => {
    btn.addEventListener('click', () => setSide(btn.dataset.side));
  });

  document.querySelectorAll('#time-group .md-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeControl(parseInt(btn.dataset.time, 10));
    });
  });

  document.querySelectorAll('#promo-modal .promo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectPromotion(btn.dataset.promo);
    });
  });

  if (dom.ledgerList) {
    dom.ledgerList.addEventListener('click', e => {
      const target = e.target.closest && e.target.closest('[data-ply]');
      if (target && target.dataset.ply !== undefined) {
        setReplayPly(parseInt(target.dataset.ply, 10));
      }
    });
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================
loadSettings();
buildCathedral(scene);
initBoard(scene);
syncBoardFull(scene);
initInput(camera, dom.canvas);
initCameraControls();
bindUIEvents();
applyLoadedSettings();
applyShadowQuality();
updateHUD();
requestAnimationFrame(animate);

// ============================================================================
// TEST HARNESS COMPATIBILITY HOOKS (ON WINDOW)
// ============================================================================
// Test hooks are exposed only when the page is opened with ?wctest, so the shipped app adds nothing to `window`.
if (new URLSearchParams(window.location.search).has('wctest')) {
  window.__state = state;
  window.state = state;
  window.handleSquareClick = handleSquareClick;
  window.selectPromotion = selectPromotion;
  window.showPromotionDialog = showPromotionDialog;
  window.hidePromotionDialog = hidePromotionDialog;
  window.setCameraPreset = setCameraPreset;
  window.flipCamera = flipCamera;
  window.showTacticalHint = showTacticalHint;
  window.undoMove = undoMove;
  window.resetGame = resetGame;
  window.closeModal = closeModal;
  window.toggleQuality = toggleQuality;
  window.toggleAudio = toggleAudio;
  window.toggleFull = toggleFull;
  window.openIoModal = openIoModal;
  window.closeIoModal = closeIoModal;
  window.exportFen = exportFen;
  window.exportPgn = exportPgn;
  window.importFen = importFen;
  window.resignGame = resignGame;
  window.offerDraw = offerDraw;
  window.setTimeControl = setTimeControl;
  window.tickClock = tickClock;
  window.formatClock = formatClock;
  window.saveSettings = saveSettings;
  window.loadSettings = loadSettings;
  window.applyLoadedSettings = applyLoadedSettings;
  window.setReplayPly = setReplayPly;
  window.stepReplay = stepReplay;
  window.getReplayGame = getReplayGame;

  Object.defineProperty(window, 'camDist', {
    get: () => state.camDist,
    set: v => { state.camDist = v; },
    configurable: true
  });
  Object.defineProperty(window, 'targetDist', {
    get: () => state.targetDist,
    set: v => { state.targetDist = v; },
    configurable: true
  });
}
