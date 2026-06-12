/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-display.ts
   Web Component <chuck-display>  — modale flottante écran 32×32
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent } from '../core/base-component.js';

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
    min-width: 240px;
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
  .live-badge {
    font-size: 9px;
    font-weight: 700;
    color: var(--green);
    letter-spacing: .06em;
    display: none;
    animation: blink 1.1s infinite;
  }
  .live-badge.on { display: block; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }

  .close-btn {
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 14px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .close-btn:hover { background: var(--red-dim); color: var(--red); }

  .canvas-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: #0a0a0a;
    flex: 1;
  }
  canvas {
    image-rendering: pixelated;
    width: 256px;
    height: 256px;
    border: 1px solid var(--border);
    border-radius: 4px;
    display: block;
  }

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
`;

export class ChuckDisplay extends ChuckComponent {
  canvas!: HTMLCanvasElement;

  protected render(): void {
    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="modal-bar" id="bar">
      <span class="modal-title">Écran — 32 × 32</span>
      <span class="live-badge" id="live">● LIVE</span>
      <button class="close-btn" id="close">✕</button>
    </div>
    <div class="canvas-wrap">
      <canvas id="screen" width="256" height="256"></canvas>
    </div>
    <div class="resize-handle" id="resize"></div>`;
  }

  protected setup(): void {
    this.canvas = this.shadow.getElementById('screen') as HTMLCanvasElement;

    this.shadow.getElementById('close')!
      .addEventListener('click', () => this.hide());

    // Bus events
    this.sub('chuck:cpu-halted', () => this.setLive(false));
    this.sub('chuck:cpu-reset',  () => this.setLive(false));
    this.sub('chuck:run',        () => this.setLive(true));
    this.sub('chuck:stop',       () => this.setLive(false));

    makeDraggable(this, this.shadow.getElementById('bar')!);
    makeResizable(this, this.shadow.getElementById('resize')!);
  }

  show(): void  { this.classList.add('visible'); }
  hide(): void  { this.classList.remove('visible'); }
  toggle(): void { this.classList.toggle('visible'); }

  private setLive(on: boolean): void {
    const badge = this.shadow.getElementById('live')!;
    badge.classList.toggle('on', on);
  }
}

customElements.define('chuck-display', ChuckDisplay);

/* ── Utilitaires drag / resize ─────────────────────────────── */
export function makeDraggable(host: HTMLElement, handle: HTMLElement): void {
  let dragging = false, ox = 0, oy = 0;

  handle.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('button')) return;
    dragging = true;
    const r = host.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    host.style.transition = 'none';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth  - host.offsetWidth,  e.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - host.offsetHeight, e.clientY - oy));
    host.style.left = `${x}px`;
    host.style.top  = `${y}px`;
  });

  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; host.style.transition = ''; document.body.style.userSelect = ''; }
  });
}

export function makeResizable(host: HTMLElement, handle: HTMLElement): void {
  let resizing = false, sw = 0, sh = 0, sx = 0, sy = 0;

  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    resizing = true;
    sw = host.offsetWidth; sh = host.offsetHeight;
    sx = e.clientX;        sy = e.clientY;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    host.style.width  = `${Math.max(240, sw + e.clientX - sx)}px`;
    host.style.height = `${Math.max(120, sh + e.clientY - sy)}px`;
  });

  document.addEventListener('mouseup', () => {
    if (resizing) { resizing = false; document.body.style.userSelect = ''; }
  });
}
