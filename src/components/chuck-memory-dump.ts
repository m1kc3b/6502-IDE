/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-memory-dump.ts
   Web Component <chuck-memory-dump>
   Grille 16×16 de la Zero Page ($0000–$00FF)
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent } from '../core/base-component.js';
import { makeDraggable, makeResizable } from './chuck-display.js';

const num2hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

const STYLES = /* css */`
  @import '/src/styles/tokens.css';

  :host {
    position: fixed;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: var(--modal-radius);
    box-shadow: var(--modal-shadow);
    width: 400px;
    min-height: 120px;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transform: scale(.97) translateY(4px);
    transition: opacity .15s, transform .15s;
    overflow: hidden;
    user-select: none;
  }
  :host(.visible) {
    opacity: 1;
    pointer-events: all;
    transform: scale(1) translateY(0);
  }

  .modal-bar {
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 10px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    cursor: grab;
    flex-shrink: 0;
  }
  .modal-bar:active { cursor: grabbing; }
  .modal-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: .08em;
    flex: 1;
  }
  .close-btn {
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    font-size: 14px;
    background: none; border: none; cursor: pointer;
    color: var(--text-muted);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .close-btn:hover { background: var(--red-dim); color: var(--red); }

  .body {
    padding: 10px;
    overflow: auto;
    flex: 1;
  }

  /* Adresses de colonne */
  .grid-header {
    display: grid;
    grid-template-columns: 44px repeat(16, 1fr);
    margin-bottom: 2px;
  }
  .grid-header span {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-muted);
    text-align: center;
  }

  /* Grille 16×16 */
  .grid-row {
    display: grid;
    grid-template-columns: 44px repeat(16, 1fr);
    align-items: center;
    border-radius: 3px;
  }
  .grid-row:hover { background: var(--surface-3); }

  .row-addr {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-muted);
    padding: 1px 4px;
  }

  .cell {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim);
    text-align: center;
    padding: 2px 1px;
    border-radius: 2px;
    transition: background var(--t-fast), color var(--t-fast);
    cursor: default;
  }
  .cell:hover   { background: var(--accent-dim); color: var(--text); }
  .cell.nonzero { color: var(--cyan); }
  .cell.changed { background: var(--amber-dim); color: var(--amber); }

  .resize-handle {
    position: absolute;
    bottom: 0; right: 0;
    width: 14px; height: 14px;
    cursor: se-resize;
    opacity: .35;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    bottom: 3px; right: 3px;
    width: 6px; height: 6px;
    border-right: 2px solid var(--text-dim);
    border-bottom: 2px solid var(--text-dim);
  }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-4); border-radius: 3px; }
`;

export class ChuckMemoryDump extends ChuckComponent {
  private _cells: HTMLElement[] = [];
  private _prev  = new Uint8Array(256);
  private _rafId = 0;

  protected render(): void {
    // Construire les 256 cellules (16×16 = $00–$FF)
    const headerCols = Array.from({ length: 16 }, (_, i) =>
      `<span>${num2hex(i)}</span>`,
    ).join('');

    const rows = Array.from({ length: 16 }, (_, row) => {
      const cells = Array.from({ length: 16 }, (_, col) => {
        const addr = row * 16 + col;
        return `<span class="cell" id="cell-${addr}" title="$${num2hex(addr)}" data-addr="${addr}">00</span>`;
      }).join('');
      return `<div class="grid-row">
        <span class="row-addr">$${num2hex(row * 16)}</span>
        ${cells}
      </div>`;
    }).join('');

    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="modal-bar" id="bar">
      <span class="modal-title">Zero Page — $0000–$00FF</span>
      <button class="close-btn" id="close">✕</button>
    </div>
    <div class="body">
      <div class="grid-header">
        <span></span>${headerCols}
      </div>
      ${rows}
    </div>
    <div class="resize-handle" id="resize"></div>`;
  }

  protected setup(): void {
    this._cells = Array.from({ length: 256 }, (_, i) =>
      this.shadow.getElementById(`cell-${i}`) as HTMLElement,
    );

    this.shadow.getElementById('close')!
      .addEventListener('click', () => this.hide());

    // Demander les 256 octets de la Zero Page via le Bus
    this.sub('chuck:cpu-updated', () => this._requestZeroPage());
    this.sub('chuck:cpu-reset',   () => {
      this._prev.fill(0);
      this._requestZeroPage();
    });

    // Recevoir les données et rafraîchir
    this.sub('chuck:memory-data', ({ address, bytes }) => {
      if (address === 0x0000) this._render(bytes);
    });

    makeDraggable(this, this.shadow.getElementById('bar')!);
    makeResizable(this, this.shadow.getElementById('resize')!);
  }

  private _requestZeroPage(): void {
    this.emit('chuck:memory-read', { address: 0x0000, length: 256 });
  }

  private _render(bytes: Uint8Array): void {
    for (let i = 0; i < 256; i++) {
      const v    = bytes[i]!;
      const cell = this._cells[i]!;
      const changed = v !== this._prev[i];
      this._prev[i] = v;

      cell.textContent = num2hex(v);
      cell.classList.toggle('nonzero', v !== 0);
      if (changed && v !== 0) {
        cell.classList.add('changed');
        setTimeout(() => cell.classList.remove('changed'), 400);
      }
    }
  }

  protected teardown(): void {
    cancelAnimationFrame(this._rafId);
  }

  show():   void { this.classList.add('visible'); }
  hide():   void { this.classList.remove('visible'); }
  toggle(): void { this.classList.toggle('visible'); }
}

customElements.define('chuck-memory-dump', ChuckMemoryDump);
