/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-editor.ts
   Web Component <chuck-editor>
   Éditeur de code — textarea enrichi (étape 1).
   CodeMirror 6 sera branché à l'étape 3.
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent } from '../core/base-component.js';
import { bus }            from '../core/bus.js';

const DEFAULT_SOURCE = `; Chuck IDE — L'Atelier 8-Bit
; Remplissage aléatoire de l'écran 32×32
; $0200–$05FF = pixels | $FE = rand | $FF = touche

  LDX #$00       ; index pixel = 0

loop:
  LDA $FE        ; couleur aléatoire
  STA $0200,X
  STA $0300,X
  STA $0400,X
  STA $0500,X
  INX
  CPX #$00
  BNE loop
  BRK
`;

const STYLES = /* css */`
  @import '/src/styles/tokens.css';

  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    background: var(--bg);
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  /* Tab bar */
  .tab-bar {
    height: 34px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px;
    height: 100%;
    font-size: 12px;
    color: var(--text-muted);
    border-right: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
    position: relative;
  }
  .tab.active { color: var(--text); background: var(--bg); }
  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: var(--accent);
  }
  .tab-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--accent);
    opacity: .7;
  }

  /* Editor zone */
  .editor-zone {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Line numbers */
  .line-numbers {
    padding: 18px 10px 18px 8px;
    background: var(--bg);
    color: var(--text-muted);
    text-align: right;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.75;
    user-select: none;
    overflow: hidden;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    min-width: 42px;
  }
  .line-numbers span { display: block; }

  /* Textarea */
  textarea {
    flex: 1;
    background: var(--bg);
    color: var(--text);
    border: none;
    outline: none;
    resize: none;
    padding: 18px 22px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.75;
    tab-size: 2;
    caret-color: var(--accent);
    overflow: auto;
    white-space: pre;
  }
  textarea::selection { background: rgba(124, 106, 247, 0.25); }

  /* Console bande */
  .console-strip {
    height: var(--console-h);
    min-height: 60px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .console-header {
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .console-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--text-muted);
  }
  .console-clear {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-muted);
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    background: none;
    border: none;
    font-family: var(--font-ui);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .console-clear:hover { background: var(--surface-3); color: var(--text); }
  .console-output {
    flex: 1;
    overflow-y: auto;
    padding: 6px 14px 8px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.6;
  }
  .log { display: block; }
  .log-ok   { color: var(--green); }
  .log-err  { color: var(--red); }
  .log-info { color: var(--cyan); }
  .log-hex  { color: var(--amber); }
  .log-dim  { color: var(--text-muted); }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-4); border-radius: 3px; }
`;

export class ChuckEditor extends ChuckComponent {
  private _ta!:      HTMLTextAreaElement;
  private _ln!:      HTMLDivElement;
  private _output!:  HTMLDivElement;

  /** Exposé pour la toolbar (appel direct via ref DOM) */
  getSource(): string {
    return this._ta?.value ?? '';
  }

  protected render(): void {
    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="tab-bar">
      <div class="tab active"><span class="tab-dot"></span>untitled.asm</div>
    </div>
    <div class="editor-zone">
      <div class="line-numbers" id="ln"></div>
      <textarea id="ta" spellcheck="false" autocorrect="off" autocapitalize="off"
        placeholder="; Écrivez votre programme 6502 ici…"></textarea>
    </div>
    <div class="console-strip">
      <div class="console-header">
        <span class="console-title">Console</span>
        <button class="console-clear" id="clear-btn">Effacer</button>
      </div>
      <div class="console-output" id="output"></div>
    </div>`;
  }

  protected setup(): void {
    this._ta     = this.shadow.getElementById('ta')     as HTMLTextAreaElement;
    this._ln     = this.shadow.getElementById('ln')     as HTMLDivElement;
    this._output = this.shadow.getElementById('output') as HTMLDivElement;

    this._ta.value = DEFAULT_SOURCE;
    this.updateLineNumbers();

    // Éditeur
    this._ta.addEventListener('input', () => {
      this.updateLineNumbers();
      this.emit('chuck:code-changed', undefined);
    });
    this._ta.addEventListener('scroll', () => {
      this._ln.scrollTop = this._ta.scrollTop;
    });
    this._ta.addEventListener('click',  () => this.emitCursor());
    this._ta.addEventListener('keyup',  () => this.emitCursor());
    this._ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = this._ta.selectionStart;
        const v = this._ta.value;
        this._ta.value = v.slice(0, s) + '  ' + v.slice(this._ta.selectionEnd);
        this._ta.selectionStart = this._ta.selectionEnd = s + 2;
        this.updateLineNumbers();
        this.emit('chuck:code-changed', undefined);
      }
    });

    // Effacer console
    this.shadow.getElementById('clear-btn')?.addEventListener('click', () => {
      this._output.innerHTML = '';
      this.log('Console effacée.', 'dim');
    });

    // Écouter les logs du Bus
    this.sub('chuck:log', ({ text, level }) => this.log(text, level));
  }

  private updateLineNumbers(): void {
    const count = this._ta.value.split('\n').length;
    this._ln.innerHTML = Array.from(
      { length: count },
      (_, i) => `<span>${i + 1}</span>`,
    ).join('');
  }

  private emitCursor(): void {
    const before = this._ta.value.slice(0, this._ta.selectionStart);
    const lines  = before.split('\n');
    this.emit('chuck:cursor-moved', {
      line: lines.length,
      col:  lines[lines.length - 1]!.length + 1,
    });
  }

  private log(text: string, level: string): void {
    const ts   = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const span = document.createElement('span');
    span.className = `log log-${level}`;
    span.textContent = `[${ts}]  ${text}`;
    this._output.appendChild(span);
    this._output.appendChild(document.createElement('br'));
    this._output.scrollTop = this._output.scrollHeight;
  }
}

customElements.define('chuck-editor', ChuckEditor);