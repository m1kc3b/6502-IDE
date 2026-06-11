/* ─────────────────────────────────────────────────────────────
   Chuck IDE — main.ts
   Point d'entrée. Enregistre les Web Components, instancie
   le bridge émulateur, câble les contrôles globaux.
   ───────────────────────────────────────────────────────────── */

import './styles/global.css';

// ── Enregistrement des Web Components ────────────────────────
import './components/chuck-toolbar.js';
import './components/chuck-editor.js';
import './components/chuck-display.js';
import './components/chuck-registers.js';
import './components/chuck-memory-dump.js';

import { bus }             from './core/bus.js';
import { EmulatorBridge }  from './core/emulator-bridge.js';

/* ── Attendre le DOM + simulator.js (chargé via <script> global) */
document.addEventListener('DOMContentLoaded', () => {

  // ── Bridge émulateur ────────────────────────────────────
  const displayEl = document.getElementById('modal-display') as
    (HTMLElement & { canvas: HTMLCanvasElement; show(): void; hide(): void; toggle(): void }) | null;

  const bridge = new EmulatorBridge();

  // Attendre que le canvas soit monté dans le shadow DOM
  // (customElements upgrading peut être asynchrone)
  customElements.whenDefined('chuck-display').then(() => {
    if (displayEl?.canvas) {
      bridge.init(displayEl.canvas);
    }
  });

  // ── Titlebar — toggles modales ───────────────────────────
  const registersEl  = document.getElementById('modal-registers')  as
    (HTMLElement & { toggle(): void }) | null;
  const memoryEl     = document.getElementById('modal-memory')      as
    (HTMLElement & { toggle(): void }) | null;

  document.getElementById('btn-show-display')
    ?.addEventListener('click', () => displayEl?.toggle());
  document.getElementById('btn-show-registers')
    ?.addEventListener('click', () => registersEl?.toggle());
  document.getElementById('btn-show-memory')
    ?.addEventListener('click', () => memoryEl?.toggle());

  // ── Status bar ───────────────────────────────────────────
  const sbState  = document.getElementById('sb-state')!;
  const sbCursor = document.getElementById('sb-cursor')!;

  bus.on('chuck:assembled',    () => { sbState.textContent = 'Assemblé';    sbState.className = 'sb-state'; });
  bus.on('chuck:assemble-err', () => { sbState.textContent = 'Erreur';      sbState.className = 'sb-state error'; });
  bus.on('chuck:run',          () => { sbState.textContent = 'En cours…';   sbState.className = 'sb-state running'; });
  bus.on('chuck:stop',         () => { sbState.textContent = 'Arrêté';      sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-reset',    () => { sbState.textContent = 'Réinitialisé';sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-halted',   () => { sbState.textContent = 'Terminé';     sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-error',    () => { sbState.textContent = 'Erreur CPU';  sbState.className = 'sb-state error'; });
  bus.on('chuck:code-changed', () => { sbState.textContent = 'Prêt';        sbState.className = 'sb-state'; });

  bus.on('chuck:cursor-moved', ({ line, col }) => {
    sbCursor.textContent = `Ln ${line}  Col ${col}`;
  });

  // ── Keyboard shortcuts ───────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + B → Assembler
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      const editorEl = document.getElementById('editor') as
        (HTMLElement & { getSource?: () => string }) | null;
      const source = editorEl?.getSource?.() ?? '';
      bus.emit('chuck:assemble', { source });
    }
    // F5 → Run / Stop
    if (e.key === 'F5') {
      e.preventDefault();
      bus.emit('chuck:run', undefined);
    }
    // F10 → Step
    if (e.key === 'F10') {
      e.preventDefault();
      bus.emit('chuck:step', undefined);
    }
  });

  // ── Bus events → simulator.js (cpu-halted / cpu-error) ──
  // simulator.js émet via window.Bus (legacy) ; on les relaie ici
  // si simulator.js utilise le Bus natif via CustomEvent
  window.addEventListener('chuck:cpu-halted' as any, (e: Event) => {
    bus.emit('chuck:cpu-halted', (e as CustomEvent).detail);
  });
  window.addEventListener('chuck:cpu-error' as any, (e: Event) => {
    bus.emit('chuck:cpu-error', (e as CustomEvent).detail);
  });

  console.info('[Chuck IDE] Initialisé ✓');
});