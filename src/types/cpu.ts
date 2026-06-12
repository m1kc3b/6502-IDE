/* ─────────────────────────────────────────────────────────────
   Chuck IDE — types/cpu.ts
   Types partagés pour le CPU, la RAM et l'assembleur.
   Importés par cpu.ts, assembler.ts, emulator.ts et le Bus.
   ───────────────────────────────────────────────────────────── */

/** Snapshot complet des registres du 6502 */
export interface CpuState {
  A:  number;   // Accumulateur
  X:  number;   // Index X
  Y:  number;   // Index Y
  P:  number;   // Processor Status (flags)
  PC: number;   // Program Counter
  SP: number;   // Stack Pointer
}

/** Valeur initiale des registres après reset */
export const CPU_RESET_STATE: CpuState = {
  A: 0, X: 0, Y: 0,
  P: 0x20,    // bit 5 toujours à 1 (unused)
  PC: 0x0600, // adresse de départ conventionnelle dans easy6502
  SP: 0xff,
};

/** Bits du registre P */
export const FLAGS = {
  C: 0x01,  // Carry
  Z: 0x02,  // Zero
  I: 0x04,  // IRQ disable
  D: 0x08,  // Decimal
  B: 0x10,  // Break
  U: 0x20,  // Unused (toujours 1)
  V: 0x40,  // Overflow
  N: 0x80,  // Negative
} as const;

/** Résultat d'un assemblage */
export interface AssembleResult {
  ok:    boolean;
  bytes: number;
  buf:   number[];
  line?: number;
  err?:  string;
}

/** État courant de la machine (CPU + meta) */
export type MachineStatus =
  | 'idle'       // pas encore assemblé
  | 'assembled'  // assemblé, prêt à tourner
  | 'running'    // en cours d'exécution
  | 'paused'     // steppé / pausé
  | 'halted'     // BRK atteint
  | 'error';     // opcode inconnu / erreur CPU
