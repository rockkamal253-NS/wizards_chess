import { dom } from './dom.js';

// ============================================================================
// NON-BLOCKING TOAST NOTIFICATIONS
// ============================================================================
export function showToast(message, type = 'warn', durationMs = 3500) {
  const container = dom.toastContainer;
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger enter animation
  const rAF = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => fn();
  rAF(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, durationMs);
}
