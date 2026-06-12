/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/display.ts
   Tâche 2.1 — Display6502

   Rendu canvas 32×32 pixels.
   Palette 16 couleurs C64-compatible.
   Se branche sur Ram64K via setPixelHook().
   ───────────────────────────────────────────────────────────── */

import { type Ram64K } from './memory.js';

export const PALETTE: readonly string[] = [
  '#000000', '#ffffff', '#880000', '#aaffee',
  '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
  '#dd8855', '#664400', '#ff7777', '#333333',
  '#777777', '#aaff66', '#0088ff', '#bbbbbb',
];

const DISPLAY_COLS = 32;
const DISPLAY_ROWS = 32;
const DISPLAY_BASE = 0x0200;

export class Display6502 {
  private _ctx:       CanvasRenderingContext2D | null = null;
  private _pixelSize  = 8;
  private _ram:       Ram64K | null = null;

  /**
   * Initialiser avec un canvas et la RAM.
   * Branche automatiquement le hook pixel sur la RAM.
   */
  init(canvas: HTMLCanvasElement, ram: Ram64K): void {
    this._ctx       = canvas.getContext('2d');
    this._pixelSize = canvas.width / DISPLAY_COLS;
    this._ram       = ram;

    // Brancher le hook — chaque écriture dans $0200–$05FF
    // déclenche le dessin du pixel correspondant
    ram.setPixelHook((addr, value) => this._drawPixel(addr, value));

    this.clear();
  }

  /** Effacer le canvas (fond noir) */
  clear(): void {
    if (!this._ctx) return;
    this._ctx.fillStyle = '#000000';
    this._ctx.fillRect(
      0, 0,
      DISPLAY_COLS * this._pixelSize,
      DISPLAY_ROWS * this._pixelSize,
    );
  }

  /**
   * Redessiner tout l'écran depuis la RAM.
   * Appelé après un reset ou un chargement de snapshot.
   */
  redraw(): void {
    if (!this._ctx || !this._ram) return;
    for (let addr = DISPLAY_BASE; addr <= 0x05ff; addr++) {
      this._drawPixel(addr, this._ram.buffer[addr]!);
    }
  }

  /** Détacher la référence canvas (ex : avant de démonter le composant) */
  destroy(): void {
    this._ctx = null;
    this._ram = null;
  }

  // ── Interne ──────────────────────────────────────────────
  private _drawPixel(addr: number, value: number): void {
    if (!this._ctx) return;
    const offset = addr - DISPLAY_BASE;
    const x = offset % DISPLAY_COLS;
    const y = Math.floor(offset / DISPLAY_COLS);
    this._ctx.fillStyle = PALETTE[value & 0x0f]!;
    this._ctx.fillRect(
      x * this._pixelSize,
      y * this._pixelSize,
      this._pixelSize,
      this._pixelSize,
    );
  }
}
