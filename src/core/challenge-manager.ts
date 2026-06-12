/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/challenge-manager.ts
   Tâche 1.3 — Routeur de défis statique (URL ?challenge=X)
   Tâche 2.3 — Sauvegarde automatique (localStorage)
   Tâche 3.3 — Moteur de validation "Automated Unit Test"
   ───────────────────────────────────────────────────────────── */

import { bus }               from './bus.js';
import { Ram64K }             from './memory.js';
import { Assembler6502 }      from './assembler.js';
import { Cpu6502 }            from './cpu.js';
import {
  type Challenge,
  type ChallengesFile,
  type ValidationResult,
  type AssertionFailure,
  type Assertion,
} from '../types/challenge.js';
import { FLAGS }              from '../types/cpu.js';

const STORAGE_PREFIX = 'chuck_day_';
const DEFAULT_MAX_CYCLES   = 10_000;

// Événement émis quand on est en mode libre (pas de défi)
// → l'éditeur garde son code de démo, le titre reste "Chuck IDE"
const IDE_FREE_MODE = 'chuck:ide-free' as const;

export class ChallengeManager {
  private _challenges: Map<number, Challenge> = new Map();
  private _current:    Challenge | null        = null;
  private _unsubs:     Array<() => void>       = [];

  // ── Initialisation ────────────────────────────────────────

  async init(): Promise<void> {
    await this._loadChallenges();
    this._bindBus();

    // Tâche 1.3 — lire le paramètre URL
    // Si pas de paramètre ?challenge=X → mode libre (code de démo)
    const id = this._getChallengeIdFromUrl();
    if (id !== null) {
      this._loadChallenge(id);
    } else {
      // Mode libre : émettre un événement pour que main.ts
      // puisse mettre à jour le titre
      bus.emit('chuck:log', {
        text:  'Mode libre — pas de défi chargé. Utilise ?challenge=1 pour démarrer.',
        level: 'dim',
      });
      // Signaler le mode libre via le bus
      (bus as any).emit(IDE_FREE_MODE, undefined);
    }
  }

  destroy(): void {
    this._unsubs.forEach(fn => fn());
  }

  get current(): Challenge | null { return this._current; }

  // ── Tâche 1.3 — Lecture URL ───────────────────────────────

  private _getChallengeIdFromUrl(): number | null {
    const params = new URLSearchParams(window.location.search);
    const raw    = params.get('challenge');
    if (!raw) return null;                          // ← pas de param = mode libre
    const id = parseInt(raw, 10);
    return isNaN(id) ? null : id;
  }

  // ── Chargement du fichier JSON ────────────────────────────

  private async _loadChallenges(): Promise<void> {
    try {
      const res  = await fetch('/challenges.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ChallengesFile;
      for (const c of data.challenges) {
        this._challenges.set(c.id, c);
      }
      bus.emit('chuck:log', {
        text:  `${this._challenges.size} défi(s) chargé(s) depuis challenges.json`,
        level: 'dim',
      });
    } catch (e) {
      bus.emit('chuck:log', {
        text:  `Impossible de charger challenges.json : ${(e as Error).message}`,
        level: 'err',
      });
    }
  }

  // ── Tâche 1.3 — Charger un défi ──────────────────────────

  private _loadChallenge(id: number): void {
    const challenge = this._challenges.get(id);
    if (!challenge) {
      bus.emit('chuck:log', {
        text:  `Défi #${id} introuvable.`,
        level: 'err',
      });
      return;
    }

    this._current = challenge;

    // Tâche 2.3 — Vérifier le localStorage avant d'injecter le template
    const saved = this._loadFromStorage(id);
    const code  = saved ?? challenge.template;

    bus.emit('chuck:challenge-loaded', {
      challenge,
      code,
      fromStorage: saved !== null,
    });

    bus.emit('chuck:log', {
      text: `Défi #${id} chargé : "${challenge.title}"${saved ? ' (code sauvegardé)' : ''}`,
      level: 'info',
    });
  }

  // ── Tâche 2.3 — LocalStorage ─────────────────────────────

  private _storageKey(id: number): string {
    return `${STORAGE_PREFIX}${id}`;
  }

  private _loadFromStorage(id: number): string | null {
    try {
      return localStorage.getItem(this._storageKey(id));
    } catch {
      return null;
    }
  }

  saveToStorage(id: number, code: string): void {
    try {
      localStorage.setItem(this._storageKey(id), code);
    } catch (e) {
      bus.emit('chuck:log', {
        text:  `Impossible de sauvegarder : ${(e as Error).message}`,
        level: 'err',
      });
    }
  }

  clearStorage(id: number): void {
    try {
      localStorage.removeItem(this._storageKey(id));
    } catch { /* silencieux */ }
  }

  // ── Tâche 3.3 — Moteur de validation ─────────────────────

  validate(source: string): ValidationResult {
    if (!this._current) {
      return { success: false, failures: [], cycles: 0, timeout: false };
    }

    const challenge   = this._current;
    const maxCycles   = challenge.maxCycles ?? DEFAULT_MAX_CYCLES;

    // Instancier une RAM + CPU headless — totalement isolés de l'UI
    const ram         = new Ram64K();
    const assembler   = new Assembler6502();
    const cpu         = new Cpu6502(ram);

    // Assembler le code
    const result = assembler.assemble(source, ram);
    if (!result.ok) {
      const failure: AssertionFailure = {
        assertion: { type: 'register', register: 'A', value: 0 },
        expected:  0,
        actual:    0,
        message:   `Erreur d'assemblage L${result.line} : ${result.err}`,
      };
      bus.emit('chuck:challenge-failed', {
        result: { success: false, failures: [failure], cycles: 0, timeout: false },
      });
      return failure.message as unknown as ValidationResult; // pour éviter un retour undefined
    }

    // Exécuter en mode synchrone / headless
    const { cycles, halted } = cpu.runSync(maxCycles);
    const timeout = !halted;
    const state   = cpu.getState();

    // Vérifier chaque assertion
    const failures: AssertionFailure[] = [];

    for (const assertion of challenge.assertions) {
      const failure = this._checkAssertion(assertion, state, ram);
      if (failure) failures.push(failure);
    }

    const success = failures.length === 0 && !timeout;
    const validationResult: ValidationResult = { success, failures, cycles, timeout };

    if (timeout) {
      bus.emit('chuck:log', {
        text:  `⚠ Timeout — programme non terminé après ${maxCycles} cycles.`,
        level: 'err',
      });
    }

    if (success) {
      bus.emit('chuck:challenge-success', { result: validationResult });
      bus.emit('chuck:log', {
        text:  `✓ Défi réussi en ${cycles} cycle(s) !`,
        level: 'ok',
      });
    } else {
      bus.emit('chuck:challenge-failed', { result: validationResult });
      for (const f of failures) {
        bus.emit('chuck:log', { text: `✗ ${f.message}`, level: 'err' });
      }
    }

    return validationResult;
  }

  // ── Vérification d'une assertion ─────────────────────────

  private _checkAssertion(
    assertion: Assertion,
    state:     ReturnType<Cpu6502['getState']>,
    ram:       Ram64K,
  ): AssertionFailure | null {

    switch (assertion.type) {

      case 'register': {
        const actual   = state[assertion.register];
        const expected = assertion.value;
        if (actual === expected) return null;
        return {
          assertion,
          expected,
          actual,
          message: assertion.failMsg
            ?? `Registre ${assertion.register} : attendu $${hex(expected)}, obtenu $${hex(actual)}`,
        };
      }

      case 'memory': {
        const actual   = ram.read(assertion.address);
        const expected = assertion.value;
        if (actual === expected) return null;
        return {
          assertion,
          expected,
          actual,
          message: assertion.failMsg
            ?? `Adresse $${addr(assertion.address)} : attendu $${hex(expected)}, obtenu $${hex(actual)}`,
        };
      }

      case 'flag': {
        const mask   = FLAGS[assertion.flag];
        const actual = (state.P & mask) !== 0;
        if (actual === assertion.set) return null;
        return {
          assertion,
          expected: assertion.set,
          actual,
          message: assertion.failMsg
            ?? `Flag ${assertion.flag} : attendu ${assertion.set ? '1' : '0'}, obtenu ${actual ? '1' : '0'}`,
        };
      }

      case 'sequence': {
        for (let i = 0; i < assertion.values.length; i++) {
          const expected = assertion.values[i]!;
          const actual   = ram.read(assertion.address + i);
          if (actual !== expected) {
            return {
              assertion,
              expected,
              actual,
              message: assertion.failMsg
                ?? `Séquence à $${addr(assertion.address + i)} : attendu $${hex(expected)}, obtenu $${hex(actual)}`,
            };
          }
        }
        return null;
      }
    }
  }

  // ── Écoutes Bus ───────────────────────────────────────────

  private _bindBus(): void {
    // Autosave à chaque changement de code
    this._unsubs.push(
      bus.on('chuck:code-changed', () => {
        if (!this._current) return;
        // La valeur du code est récupérée via chuck:autosave
        // émis par chuck-editor avec le contenu courant
      }),
    );

    this._unsubs.push(
      bus.on('chuck:autosave', ({ id, code }) => {
        this.saveToStorage(id, code);
      }),
    );

    // Demande de validation depuis le panneau défi
    this._unsubs.push(
      bus.on('chuck:validate', ({ source }) => {
        this.validate(source);
      }),
    );

    // Navigation vers un autre défi
    this._unsubs.push(
      bus.on('chuck:goto-challenge', ({ id }) => {
        this._loadChallenge(id);
        // Mettre à jour l'URL sans recharger la page
        const url = new URL(window.location.href);
        url.searchParams.set('challenge', String(id));
        window.history.pushState({}, '', url.toString());
      }),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────
const hex  = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const addr = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();