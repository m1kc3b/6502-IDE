/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-toolbar.ts
   Web Component <chuck-toolbar>
   Barre d'outils verticale gauche.
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent }          from '../core/base-component.js';
import { type ToolbarState }  from '../core/bus.js';

const STYLES = /* css */`
  @import '/src/styles/tokens.css';

  :host {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: var(--toolbar-w);
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 10px 0;
    gap: 2px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .tb-btn {
    width: 42px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px 4px;
    border-radius: 8px;
    font-family: var(--font-ui);
    font-size: 9px;
    letter-spacing: .04em;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast), transform .08s;
    flex-shrink: 0;
  }
  .tb-btn:hover  { color: var(--text); background: var(--surface-3); }
  .tb-btn:active { transform: scale(.94); }
  .tb-btn:disabled {
    opacity: .25;
    cursor: not-allowed;
    transform: none;
  }
  .tb-btn svg { width: 18px; height: 18px; flex-shrink: 0; }

  .tb-btn.assemble       { color: var(--cyan); }
  .tb-btn.assemble:hover { background: var(--cyan-dim); }

  .tb-btn.run            { color: var(--green); }
  .tb-btn.run:hover      { background: var(--green-dim); }
  .tb-btn.run.running    { color: var(--red); }
  .tb-btn.run.running:hover { background: var(--red-dim); }

  .tb-btn.step           { color: var(--amber); }
  .tb-btn.step:hover     { background: var(--amber-dim); }

  .tb-btn.reset          { color: var(--red); }
  .tb-btn.reset:hover    { background: var(--red-dim); }

  .tb-sep {
    width: 28px;
    height: 1px;
    background: var(--border);
    margin: 4px 0;
    flex-shrink: 0;
  }

  .tb-btn.debug            { color: var(--text-muted); }
  .tb-btn.debug:hover      { background: rgba(124,106,247,.1); color: var(--accent); }
  .tb-btn.debug.active     {
    color: var(--accent);
    background: rgba(124,106,247,.15);
    border: 1px solid rgba(124,106,247,.3);
    border-radius: 8px;
  }

  .tb-speed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    font-size: 9px;
    color: var(--text-muted);
    width: 42px;
    margin-top: auto;
  }
  .tb-speed-val {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--text-dim);
  }
  .tb-speed input[type=range] {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 60px;
    accent-color: var(--accent);
    cursor: pointer;
  }
`;

const TEMPLATE = /* html */`
  <style>${STYLES}</style>

  <button class="tb-btn assemble" data-action="assemble" title="Assembler">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M12 3L3 8l9 5 9-5-9-5z"/>
      <path d="M3 13l9 5 9-5"/>
      <path d="M3 18l9 5 9-5"/>
    </svg>
    <span>Assembler</span>
  </button>

  <div class="tb-sep"></div>

  <button class="tb-btn run" data-action="run" title="Exécuter" disabled>
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
    <span>Run</span>
  </button>

  <button class="tb-btn step" data-action="step" title="Pas à pas" disabled>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <polyline points="13 17 18 12 13 7"/>
      <line x1="6" y1="12" x2="18" y2="12"/>
    </svg>
    <span>Étape</span>
  </button>

  <div class="tb-sep"></div>

  <button class="tb-btn reset" data-action="reset" title="Réinitialiser" disabled>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    </svg>
    <span>Reset</span>
  </button>

  <div class="tb-sep"></div>

  <button class="tb-btn" data-action="hexdump" title="Hexdump" disabled>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18"/>
    </svg>
    <span>Hexdump</span>
  </button>

  <button class="tb-btn" data-action="disassemble" title="Désassembler" disabled>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
    <span>Disasm</span>
  </button>

  <div class="tb-sep"></div>

  <button class="tb-btn debug" data-action="debug" id="btn-debug" title="Mode debug pas à pas (Étape)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         style="width:18px;height:18px">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8"  x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>Debug</span>
  </button>

  <div class="tb-speed">
    <span>Vitesse</span>
    <input type="range" id="speed-slider" min="1" max="100" value="50">
    <span class="tb-speed-val" id="speed-val">50%</span>
  </div>
`;

export class ChuckToolbar extends ChuckComponent {

  private _state: ToolbarState = 'idle';

  protected render(): void {
    this.shadow.innerHTML = TEMPLATE;
  }

  protected setup(): void {
    // Délégation d'événements sur les boutons
    this.shadow.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (!btn || btn.disabled) return;
      const action = btn.dataset['action']!;
      this.dispatchAction(action);
    });

    // Bouton debug — toggle
    // La délégation click existante appelle dispatchAction('debug')

    // Slider vitesse
    const slider = this.shadow.getElementById('speed-slider') as HTMLInputElement;
    const valEl  = this.shadow.getElementById('speed-val')!;
    slider?.addEventListener('input', () => {
      valEl.textContent = `${slider.value}%`;
      this.emit('chuck:speed', { value: Number(slider.value) });
    });

    // Écouter les changements d'état depuis le Bus
    this.sub('chuck:toolbar-state', ({ state }) => this.applyState(state));
    this.sub('chuck:assembled',     () => this.applyState('assembled'));
    this.sub('chuck:assemble-err',  () => this.applyState('idle'));
    this.sub('chuck:cpu-reset',     () => this.applyState('idle'));
    this.sub('chuck:cpu-halted',    () => {
      const debugOn = this.shadow.getElementById('btn-debug')?.classList.contains('active') ?? false;
      this.applyState(debugOn ? 'debugging' : 'assembled');
    });
    this.sub('chuck:code-changed',  () => this.applyState('idle'));
  }

  private dispatchAction(action: string): void {
    switch (action) {
      case 'assemble': {
        // Récupérer le source depuis l'éditeur via un événement DOM natif
        const editorEl = document.getElementById('editor') as (HTMLElement & { getSource?: () => string }) | null;
        const source   = editorEl?.getSource?.() ?? '';
        this.emit('chuck:assemble', { source });
        break;
      }
      case 'run': {
        if (this._state === 'running') {
          this.emit('chuck:stop', undefined);
        } else {
          this.emit('chuck:run', undefined);
          this.applyState('running');
        }
        break;
      }
      case 'step':        this.emit('chuck:step',        undefined); break;
      case 'reset':       this.emit('chuck:reset',       undefined); break;
      case 'hexdump':     this.emit('chuck:hexdump',     undefined); break;
      case 'disassemble': this.emit('chuck:disassemble', undefined); break;
      case 'debug': {
        // Toggle debug : ne s'active que si on est assemblé ou déjà en debug
        if (!['assembled', 'debugging'].includes(this._state)) break;
        const nowDebugging = this._state !== 'debugging';
        // Mettre à jour visuellement le bouton
        const dbgBtn = this.shadow.getElementById('btn-debug');
        dbgBtn?.classList.toggle('active', nowDebugging);
        this.emit('chuck:debug', { enabled: nowDebugging });
        this.applyState(nowDebugging ? 'debugging' : 'assembled');
        break;
      }
    }
  }

  private applyState(state: ToolbarState): void {
    this._state = state;

    const assembled  = ['assembled', 'running', 'debugging'].includes(state);
    const running    = state === 'running';
    const debugging  = state === 'debugging';

    this.setDisabled('assemble',    assembled);
    this.setDisabled('run',         !assembled || debugging);  // Run désactivé en debug
    this.setDisabled('step',        !debugging);
    this.setDisabled('reset',       !assembled);
    this.setDisabled('hexdump',     !assembled);
    this.setDisabled('disassemble', !assembled);

    const runBtn  = this.shadow.querySelector<HTMLButtonElement>('[data-action="run"]')!;
    const runSvg  = runBtn?.querySelector('svg')!;
    const runSpan = runBtn?.querySelector('span')!;
    if (running) {
      runBtn.classList.add('running');
      runSpan.textContent = 'Stop';
      runSvg.innerHTML = `
        <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
        <rect x="14" y="4" width="4" height="16" fill="currentColor"/>`;
    } else {
      runBtn.classList.remove('running');
      runSpan.textContent = 'Run';
      runSvg.innerHTML = `<polygon points="5,3 19,12 5,21" fill="currentColor"/>`;
    }

  }

  private setDisabled(action: string, disabled: boolean): void {
    const btn = this.shadow.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (btn) btn.disabled = disabled;
  }
}

customElements.define('chuck-toolbar', ChuckToolbar);