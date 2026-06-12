/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/memory.ts
   Tâche 2.1 — Ram64K

   Modélise les 64 Ko d'adressage du MOS 6502.
   - Stockage : Uint8Array (performant, pas de boxing)
   - $FE        : octet pseudo-aléatoire à la lecture
   - $FF        : dernière touche ASCII (écrit par le clavier)
   - $0200–$05FF: zone display (hook vers Display6502)
   - $0100–$01FF: stack (accès direct, pas de hook)
   ───────────────────────────────────────────────────────────── */

export type PixelHook = (addr: number, value: number) => void;

export class Ram64K {
  /** Buffer brut — exposé en lecture seule pour le moniteur mémoire */
  readonly buffer = new Uint8Array(0x10000);

  private _pixelHook: PixelHook | null = null;

  /** Brancher le hook d'affichage (appelé par Display6502) */
  setPixelHook(fn: PixelHook): void {
    this._pixelHook = fn;
  }

  /** Lecture — $FE retourne un octet aléatoire */
  read(addr: number): number {
    addr &= 0xffff;
    if (addr === 0xfe) return (Math.random() * 256) | 0;
    return this.buffer[addr]!;
  }

  /** Écriture brute (stack, registres internes) — pas de hook */
  write(addr: number, value: number): void {
    this.buffer[addr & 0xffff] = value & 0xff;
  }

  /**
   * Écriture publique avec hook display.
   * À utiliser pour toutes les instructions STA/STX/STY/INC/DEC…
   */
  store(addr: number, value: number): void {
    addr  &= 0xffff;
    value &= 0xff;
    this.buffer[addr] = value;

    // Zone display : $0200–$05FF (32×32 pixels × 4 pages)
    if (addr >= 0x0200 && addr <= 0x05ff) {
      this._pixelHook?.(addr, value);
    }
  }

  /** Lire un mot 16 bits little-endian */
  readWord(addr: number): number {
    return this.read(addr) | (this.read((addr + 1) & 0xffff) << 8);
  }

  /** Stocker la dernière touche pressée en $FF */
  storeKeypress(code: number): void {
    this.write(0xff, code & 0xff);
  }

  /**
   * Écrire un bloc de bytes à partir d'une adresse de base.
   * Utilisé par l'assembleur pour charger le programme en RAM.
   */
  loadBytes(baseAddr: number, bytes: readonly number[]): void {
    for (let i = 0; i < bytes.length; i++) {
      // Pas de hook display pendant le chargement — l'écran est effacé séparément
      this.buffer[(baseAddr + i) & 0xffff] = bytes[i]! & 0xff;
    }
  }

  /** Effacement complet — RAM à zéro */
  reset(): void {
    this.buffer.fill(0);
  }

  /**
   * Dump hexadécimal lisible d'une région mémoire.
   * Format : "0600: A9 01 8D 00 02 …"
   */
  hexDump(start: number, length: number): string {
    const lines: string[] = [];
    for (let i = 0; i < length; i++) {
      if ((i & 15) === 0) {
        if (i > 0) lines[lines.length - 1] += '';
        lines.push(`${addr2hex(start + i)}: `);
      }
      lines[lines.length - 1] += `${num2hex(this.read(start + i))} `;
    }
    return lines.map(l => l.trimEnd()).join('\n');
  }
}

/* ── Helpers ────────────────────────────────────────────────── */
const num2hex  = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const addr2hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();
