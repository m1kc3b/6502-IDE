/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/bus.ts
   Event Bus typé — communication découplée entre modules.

   Utilise les CustomEvent natifs du navigateur sur un
   EventTarget dédié (pas le document global, évite les fuites).
   ───────────────────────────────────────────────────────────── */

/* ── Types des événements ────────────────────────────────────── */
export interface CpuState {
  A:  number;
  X:  number;
  Y:  number;
  P:  number;   // Processor Status
  PC: number;
  SP: number;
}

export interface AssembleResult {
  ok:    boolean;
  bytes: number;
  buf:   number[];
  line?: number;
  err?:  string;
}

export interface ChuckEventMap {
  // ── Commandes UI → Émulateur ────────────────────────────
  'chuck:assemble':   { source: string };
  'chuck:run':        undefined;
  'chuck:stop':       undefined;
  'chuck:step':       undefined;
  'chuck:reset':      undefined;
  'chuck:goto':       { address: number };
  'chuck:hexdump':    undefined;
  'chuck:disassemble':undefined;
  'chuck:speed':      { value: number };    // 1–100 %
  'chuck:debug':      { enabled: boolean };
  'chuck:breakpoint': { line: number; active: boolean };

  // ── Émulateur → UI ──────────────────────────────────────
  'chuck:cpu-updated':  CpuState;
  'chuck:cpu-reset':    CpuState;
  'chuck:cpu-halted':   CpuState;
  'chuck:cpu-error':    { msg: string };
  'chuck:assembled':    AssembleResult;
  'chuck:assemble-err': { line: number; err: string };

  // ── Console ─────────────────────────────────────────────
  'chuck:log':     { text: string; level: 'info' | 'ok' | 'err' | 'hex' | 'dim' };

  // ── Éditeur ─────────────────────────────────────────────
  'chuck:code-changed':  undefined;
  'chuck:cursor-moved':  { line: number; col: number };

  // ── UI state ────────────────────────────────────────────
  'chuck:toolbar-state': { state: ToolbarState };

  // ── Mémoire — lecture à la demande ──────────────────────
  /** Demander la lecture d'un bloc mémoire (émis par l'UI) */
  'chuck:memory-read':   { address: number; length: number };
  /** Réponse avec les données (émis par Emulator) */
  'chuck:memory-data':   { address: number; bytes: Uint8Array };

  // ── Défis (ChallengeManager) ─────────────────────────────
  'chuck:challenge-loaded':  { challenge: import('../types/challenge.js').Challenge; code: string; fromStorage: boolean };
  'chuck:challenge-success': { result:    import('../types/challenge.js').ValidationResult };
  'chuck:challenge-failed':  { result:    import('../types/challenge.js').ValidationResult };
  'chuck:validate':          { source: string };
  'chuck:goto-challenge':    { id: number };
  'chuck:autosave':          { id: number; code: string };
}

export type ChuckEventName = keyof ChuckEventMap;
export type ToolbarState   = 'idle' | 'assembled' | 'running' | 'debugging';

/* ── Bus singleton ───────────────────────────────────────────── */
export class EventBus {
  private readonly target = new EventTarget();

  emit<K extends ChuckEventName>(
    event: K,
    detail: ChuckEventMap[K],
  ): void {
    this.target.dispatchEvent(
      new CustomEvent(event, { detail, bubbles: false }),
    );
  }

  on<K extends ChuckEventName>(
    event: K,
    handler: (detail: ChuckEventMap[K]) => void,
  ): () => void {
    const listener = (e: Event) =>
      handler((e as CustomEvent<ChuckEventMap[K]>).detail);
    this.target.addEventListener(event, listener);
    // Retourne une fonction de désinscription
    return () => this.target.removeEventListener(event, listener);
  }

  once<K extends ChuckEventName>(
    event: K,
    handler: (detail: ChuckEventMap[K]) => void,
  ): void {
    const unsub = this.on(event, (d) => { handler(d); unsub(); });
  }
}

export const bus = new EventBus();
