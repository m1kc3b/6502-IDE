/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-registers.ts
   Web Component <chuck-registers>  — registres + flags + moniteur
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent }  from '../core/base-component.js';
import { type CpuState }   from '../core/bus.js';
import { makeDraggable, makeResizable } from './chuck-display.js';

const num2hex  = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const addr2hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();
const num2bin  = (n: number) => n.toString(2).padStart(8, '0');

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
    width: 310px;
    min-height: 120px;
    max-height: 80vh;
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
    padding: 12px;
    overflow-y: auto;
    flex: 1;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  /* Registres */
  .reg-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  .reg-card {
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 9px;
    transition: background var(--t-fast);
  }
  .reg-card.flash { background: rgba(251,191,36,.18); }
  .reg-card.wide  { grid-column: span 2; }
  .reg-name {
    font-size: 9px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 3px;
  }
  .reg-val {
    font-size: 15px;
    font-weight: 700;
    color: var(--cyan);
  }
  .reg-card.wide .reg-val { color: var(--accent); }
  .reg-card.sp   .reg-val { color: var(--green); }

  /* Flags */
  .section-label {
    font-size: 9px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .1em;
    margin-bottom: 5px;
    font-family: var(--font-ui);
  }
  .flags-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .flag {
    padding: 2px 9px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    background: var(--surface-3);
    color: var(--text-muted);
    border: 1px solid var(--border);
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  .flag.set {
    background: var(--green-dim);
    color: var(--green);
    border-color: rgba(61,214,140,.3);
  }

  /* Moniteur */
  .monitor-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-bottom: 10px;
  }
  .monitor-table th {
    color: var(--text-muted);
    text-align: left;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-family: var(--font-ui);
  }
  .monitor-table td {
    padding: 2px 6px;
    border-bottom: 1px solid var(--surface-3);
    color: var(--text);
  }
  .monitor-table td:first-child { color: var(--text-muted); }
  .monitor-table td:last-child   { color: var(--amber); }
  .monitor-table tr:hover td     { background: var(--surface-3); }

  /* Goto — épinglé sous le body, toujours visible */
  .goto-row {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--surface);
  }
  .goto-row input {
    flex: 1;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 5px 9px;
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    outline: none;
    transition: border-color var(--t-fast);
  }
  .goto-row input:focus { border-color: var(--accent); }
  .goto-btn {
    padding: 5px 12px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 6px;
    font-size: 11px;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .goto-btn:hover { background: var(--border); color: var(--text); }

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

export class ChuckRegisters extends ChuckComponent {
  private _prev: Partial<CpuState> = {};
  // Adresse affichée dans le moniteur — indépendante du PC
  // Initialisée à $0000 (Zero Page), modifiable via le champ "Go"
  private _monitorAddr = 0x0000;
  // Cache des derniers octets lus
  private _monitorBytes = new Uint8Array(16) as Uint8Array;

  protected render(): void {
    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="modal-bar" id="bar">
      <span class="modal-title">Registres &amp; Débogueur</span>
      <button class="close-btn" id="close">✕</button>
    </div>
    <div class="body">
      <div class="reg-grid">
        <div class="reg-card wide" id="card-pc">
          <div class="reg-name">PC — Program Counter</div>
          <div class="reg-val" id="reg-pc">$0600</div>
        </div>
        <div class="reg-card sp" id="card-sp">
          <div class="reg-name">SP</div>
          <div class="reg-val" id="reg-sp">$FF</div>
        </div>
        <div class="reg-card" id="card-a">
          <div class="reg-name">A — Accumulateur</div>
          <div class="reg-val" id="reg-a">$00</div>
        </div>
        <div class="reg-card" id="card-x">
          <div class="reg-name">X</div>
          <div class="reg-val" id="reg-x">$00</div>
        </div>
        <div class="reg-card" id="card-y">
          <div class="reg-name">Y</div>
          <div class="reg-val" id="reg-y">$00</div>
        </div>
      </div>

      <div class="section-label">Processor Status Flags</div>
      <div class="flags-row">
        <span class="flag" id="flag-n">N</span>
        <span class="flag" id="flag-v">V</span>
        <span class="flag" id="flag-b">B</span>
        <span class="flag" id="flag-d">D</span>
        <span class="flag" id="flag-i">I</span>
        <span class="flag" id="flag-z">Z</span>
        <span class="flag" id="flag-c">C</span>
      </div>

      <div class="section-label">Moniteur mémoire</div>
      <table class="monitor-table">
        <thead><tr><th>Addr</th><th>Dec</th><th>Hex</th><th>Bin</th></tr></thead>
        <tbody id="monitor-body">
          <tr><td colspan="4" style="color:var(--text-muted);font-style:italic;padding:6px">
            — non assemblé —
          </td></tr>
        </tbody>
      </table>
    </div>

    <div class="goto-row">
      <input type="text" id="goto-input" placeholder="$0000 — adresse RAM">
      <button class="goto-btn" id="goto-btn">Go</button>
    </div>
    <div class="resize-handle" id="resize"></div>`;
  }

  protected setup(): void {
    this.shadow.getElementById('close')!
      .addEventListener('click', () => this.hide());

    this.shadow.getElementById('goto-btn')!
      .addEventListener('click', () => {
        const raw = (this.shadow.getElementById('goto-input') as HTMLInputElement).value.trim();
        let addr: number | null = null;
        if (/^\$[0-9a-fA-F]+$/.test(raw))   addr = parseInt(raw.slice(1), 16);
        else if (/^[0-9a-fA-F]+$/.test(raw)) addr = parseInt(raw, 16);
        else if (/^\d+$/.test(raw))           addr = parseInt(raw, 10);
        if (addr !== null) {
          this._monitorAddr = addr & 0xffff;
          // Naviguer le PC du CPU
          this.emit('chuck:goto', { address: this._monitorAddr });
          // Rafraîchir le moniteur à la nouvelle adresse
          this.updateMonitor();
        }
      });

    this.sub('chuck:cpu-updated', (s) => this.updateRegs(s));
    this.sub('chuck:cpu-reset',   (s) => this.updateRegs(s));
    this.sub('chuck:cpu-halted',  (s) => this.updateRegs(s));

    // Recevoir les données mémoire depuis Emulator
    this.sub('chuck:memory-data', ({ address, bytes }) => {
      if (address === this._monitorAddr) {
        this._monitorBytes = new Uint8Array(bytes);
        this._renderMonitor();
      }
    });

    makeDraggable(this, this.shadow.getElementById('bar')!);
    makeResizable(this, this.shadow.getElementById('resize')!);
  }

  private updateRegs(state: CpuState): void {
    this.setReg('a',  `$${num2hex(state.A)}`,  state.A  !== this._prev.A);
    this.setReg('x',  `$${num2hex(state.X)}`,  state.X  !== this._prev.X);
    this.setReg('y',  `$${num2hex(state.Y)}`,  state.Y  !== this._prev.Y);
    this.setReg('sp', `$${num2hex(state.SP)}`, state.SP !== this._prev.SP);
    this.setReg('pc', `$${addr2hex(state.PC)}`,state.PC !== this._prev.PC);

    const flags = [
      { id: 'flag-n', mask: 0x80 },
      { id: 'flag-v', mask: 0x40 },
      { id: 'flag-b', mask: 0x10 },
      { id: 'flag-d', mask: 0x08 },
      { id: 'flag-i', mask: 0x04 },
      { id: 'flag-z', mask: 0x02 },
      { id: 'flag-c', mask: 0x01 },
    ];
    for (const { id, mask } of flags) {
      this.shadow.getElementById(id)!.classList.toggle('set', (state.P & mask) !== 0);
    }

    this.updateMonitor();
    this._prev = { ...state };

    // Status bar PC
    const sbPc = document.getElementById('sb-pc');
    if (sbPc) sbPc.textContent = `$${addr2hex(state.PC)}`;
  }

  private setReg(id: string, value: string, changed: boolean): void {
    const val  = this.shadow.getElementById(`reg-${id}`)!;
    const card = this.shadow.getElementById(`card-${id}`)!;
    val.textContent = value;
    if (changed) {
      card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 350);
    }
  }

  /** Demande une lecture mémoire à Emulator via le Bus */
  private updateMonitor(): void {
    this.emit('chuck:memory-read', { address: this._monitorAddr, length: 16 });
  }

  /** Rendu du tableau à partir du cache _monitorBytes */
  private _renderMonitor(): void {
    const tbody = this.shadow.getElementById('monitor-body');
    if (!tbody) return;
    const rows: string[] = [];
    for (let i = 0; i < this._monitorBytes.length; i++) {
      const addr = (this._monitorAddr + i) & 0xffff;
      const v    = this._monitorBytes[i]!;
      rows.push(`<tr>
        <td>$${addr2hex(addr)}</td>
        <td>${v}</td>
        <td>$${num2hex(v)}</td>
        <td>${num2bin(v)}</td>
      </tr>`);
    }
    tbody.innerHTML = rows.join('');
  }

  show():   void { this.classList.add('visible'); }
  hide():   void { this.classList.remove('visible'); }
  toggle(): void { this.classList.toggle('visible'); }
}

customElements.define('chuck-registers', ChuckRegisters);