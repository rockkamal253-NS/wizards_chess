import { state } from './state.js';
import { dom } from './dom.js';
import { toggleAudio, updateHUD } from './hud.js';
import { undoMove, resetGame, stepReplay, showTacticalHint } from './commands.js';

// ============================================================================
// CAMERA PRESETS, ORBIT CONTROLS & KEYBOARD SHORTCUTS
// ============================================================================
export function setCameraPreset(id) {
  if (id === 1) {
    state.targetYaw = 0;
    state.targetPitch = 0.66;
    state.targetDist = 15.6;
  } else if (id === 2) {
    state.targetYaw = 0.62;
    state.targetPitch = 0.50;
    state.targetDist = 14.5;
  } else if (id === 3) {
    state.targetYaw = 0;
    state.targetPitch = 1.44;
    state.targetDist = 17.2;
  }
}

export function flipCamera() {
  state.targetYaw += Math.PI;
}

export function initCameraControls() {
  window.addEventListener('wheel', e => {
    state.targetDist = Math.max(8.5, Math.min(25.0, state.targetDist + e.deltaY * 0.008));
  });

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepReplay(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepReplay(1);
    } else if (k === ' ') {
      e.preventDefault();
      flipCamera();
    } else if (k === '1') {
      setCameraPreset(1);
    } else if (k === '2') {
      setCameraPreset(2);
    } else if (k === '3') {
      setCameraPreset(3);
    } else if (k === 'z') {
      undoMove();
    } else if (k === 'h') {
      showTacticalHint();
    } else if (k === 'm') {
      toggleAudio();
    } else if (k === 'r') {
      const now = performance.now();
      if (state.game.history().length === 0 || now < state.resetArmedUntil) {
        state.resetArmedUntil = 0;
        resetGame();
      } else {
        state.resetArmedUntil = now + 1500;
        if (dom.statusText) dom.statusText.textContent = 'PRESS R AGAIN TO RESET';
        setTimeout(() => {
          if (state.aiPendingGen !== state.gen) updateHUD();
        }, 1500);
      }
    }
  });

  // Toolbar buttons must not keep keyboard focus, otherwise Space/Enter would re-trigger them
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });
}
