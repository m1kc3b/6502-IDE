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
import './components/chuck-challenge-panel.js';

import { bus }              from './core/bus.js';
import { Emulator }         from './core/emulator.js';
import { ChallengeManager } from './core/challenge-manager.js';

document.addEventListener('DOMContentLoaded', () => {

  // ── Émulateur (Tâche 2.1 + 2.2) ─────────────────────────
  const emulator = new Emulator();

  // Câbler le canvas une fois le Web Component monté
  const displayEl = document.getElementById('modal-display') as
    (HTMLElement & { canvas?: HTMLCanvasElement; show(): void; toggle(): void }) | null;

  customElements.whenDefined('chuck-display').then(() => {
    if (displayEl?.canvas) emulator.initDisplay(displayEl.canvas);
  });

  // ── ChallengeManager (Tâche 1.3 + 2.3 + 3.3) ────────────
  const challengeManager = new ChallengeManager();
  challengeManager.init();

  // ── Titlebar — toggles modales ───────────────────────────
  const registersEl  = document.getElementById('modal-registers')  as (HTMLElement & { toggle(): void }) | null;
  const memoryEl     = document.getElementById('modal-memory')      as (HTMLElement & { toggle(): void }) | null;
  const challengeEl  = document.getElementById('modal-challenge')   as (HTMLElement & { toggle(): void; show(): void }) | null;

  document.getElementById('btn-show-display')
    ?.addEventListener('click', () => displayEl?.toggle());
  document.getElementById('btn-show-registers')
    ?.addEventListener('click', () => registersEl?.toggle());
  document.getElementById('btn-show-memory')
    ?.addEventListener('click', () => memoryEl?.toggle());

  // Bouton "Défi" :
  // - Si un défi est en cours → toggle le panneau
  // - Sinon → navigue vers ?challenge=1 (premier défi)
  document.getElementById('btn-show-challenge')
    ?.addEventListener('click', () => {
      if (challengeManager.current) {
        challengeEl?.toggle();
      } else {
        bus.emit('chuck:goto-challenge', { id: 1 });
        challengeEl?.show();
      }
    });

  // ── Titre de la page et de la titlebar ──────────────────

  const titlebarFile = document.getElementById('titlebar-file')!;

  // Mode libre au démarrage (pas de ?challenge=X)
  // Le titre par défaut dans index.html est déjà "Chuck IDE"

  // Quand un défi est chargé : met à jour titre + <title>
  bus.on('chuck:challenge-loaded', ({ challenge }) => {
    const label = `Jour ${challenge.id} — ${challenge.title}`;
    titlebarFile.textContent      = label;
    document.title                = `${label} — Chuck IDE`;
  });

  // Quand on revient en mode libre (navigation arrière ou reset URL)
  // Note : le cast any est nécessaire car IDE_FREE_MODE n'est pas dans ChuckEventMap
  // Il est émis directement sans typage strict
  (bus as any).on('chuck:ide-free', () => {
    titlebarFile.textContent = 'mode libre';
    document.title           = "Chuck IDE — L'Atelier 8-Bit";
  });
  const sbState  = document.getElementById('sb-state')!;
  const sbCursor = document.getElementById('sb-cursor')!;
  const sbPc     = document.getElementById('sb-pc')!;

  const addr2hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();

  bus.on('chuck:assembled',    () => { sbState.textContent = 'Assemblé';     sbState.className = 'sb-state'; });
  bus.on('chuck:assemble-err', () => { sbState.textContent = 'Erreur';       sbState.className = 'sb-state error'; });
  bus.on('chuck:run',          () => { sbState.textContent = 'En cours…';    sbState.className = 'sb-state running'; });
  bus.on('chuck:stop',         () => { sbState.textContent = 'Arrêté';       sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-reset',    () => { sbState.textContent = 'Réinitialisé'; sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-halted',   () => { sbState.textContent = 'Terminé';      sbState.className = 'sb-state'; });
  bus.on('chuck:cpu-error',    () => { sbState.textContent = 'Erreur CPU';   sbState.className = 'sb-state error'; });
  bus.on('chuck:code-changed', () => { sbState.textContent = 'Prêt';         sbState.className = 'sb-state'; });

  bus.on('chuck:cpu-updated', ({ PC }) => {
    sbPc.textContent = `$${addr2hex(PC)}`;
  });
  bus.on('chuck:cursor-moved', ({ line, col }) => {
    sbCursor.textContent = `Ln ${line}  Col ${col}`;
  });

  // ── Keyboard shortcuts ───────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      const editorEl = document.getElementById('editor') as
        (HTMLElement & { getSource?: () => string }) | null;
      bus.emit('chuck:assemble', { source: editorEl?.getSource?.() ?? '' });
    }
    if (e.key === 'F5') { e.preventDefault(); bus.emit('chuck:run', undefined); }
    if (e.key === 'F10') { e.preventDefault(); bus.emit('chuck:step', undefined); }
  });

  console.info('[Chuck IDE v0.1.0] Initialisé ✓');
});