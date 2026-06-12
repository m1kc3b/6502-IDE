/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-challenge-panel.ts
   Web Component <chuck-challenge-panel>
   Tâche 4.3 — Panneau consigne + bouton Valider + navigation
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent }     from '../core/base-component.js';
import type { Challenge, ValidationResult } from '../types/challenge.js';

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
    width: 360px;
    max-height: 80vh;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transform: scale(.97) translateY(4px);
    transition: opacity .15s, transform .15s;
    overflow: hidden;
  }
  :host(.visible) {
    opacity: 1;
    pointer-events: all;
    transform: scale(1) translateY(0);
  }

  /* ── Barre drag ──────────────────────────────────────────── */
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
    user-select: none;
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

  /* ── Corps scrollable ────────────────────────────────────── */
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ── En-tête défi ────────────────────────────────────────── */
  .challenge-day {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: .1em;
  }
  .challenge-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
    margin-top: 2px;
  }

  /* ── Description ─────────────────────────────────────────── */
  .description {
    font-size: 12.5px;
    line-height: 1.65;
    color: var(--text-dim);
  }
  .description strong { color: var(--text); font-weight: 600; }
  .description code {
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--surface-3);
    color: var(--cyan);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .description h2 {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: .06em;
    margin: 10px 0 4px;
  }
  .description ul {
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  /* ── Référence Zaks ─────────────────────────────────────── */
  .zaks-ref {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
    font-size: 11px;
  }
  .zaks-icon { font-size: 16px; flex-shrink: 0; }
  .zaks-text { color: var(--text-dim); }
  .zaks-text strong { color: var(--text); font-family: var(--font-mono); font-size: 10px; }

  /* ── Concepts ────────────────────────────────────────────── */
  .concepts { display: flex; flex-wrap: wrap; gap: 5px; }
  .concept-tag {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--cyan-dim);
    color: var(--cyan);
    border: 1px solid rgba(56,189,248,.2);
  }

  /* ── Hints ───────────────────────────────────────────────── */
  .hints-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 6px;
    font-family: var(--font-ui);
  }
  .hint-item {
    padding: 7px 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 5px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
    transition: background var(--t-fast);
    user-select: none;
  }
  .hint-item:hover { background: var(--surface-4); }
  .hint-item.revealed {
    cursor: default;
    color: var(--amber);
    border-color: rgba(251,191,36,.2);
    background: var(--amber-dim);
  }
  .hint-item.hidden-hint .hint-text      { display: none; }
  .hint-item.hidden-hint .hint-placeholder { display: block; }
  .hint-item .hint-placeholder { color: var(--text-muted); font-style: italic; }
  .hint-item.revealed .hint-placeholder  { display: none; }
  .hint-item.revealed .hint-text         { display: block; }

  /* ── Séparateur ──────────────────────────────────────────── */
  .sep { height: 1px; background: var(--border); margin: 0 -16px; }

  /* ── Feedback validation ─────────────────────────────────── */
  .feedback {
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    display: none;
  }
  .feedback.success {
    display: block;
    background: var(--green-dim);
    border: 1px solid rgba(61,214,140,.3);
    color: var(--green);
  }
  .feedback.failure {
    display: block;
    background: var(--red-dim);
    border: 1px solid rgba(248,113,113,.3);
    color: var(--red);
  }
  .feedback .fb-title  { font-weight: 700; margin-bottom: 4px; font-size: 13px; }
  .feedback .fb-detail { color: inherit; opacity: .85; font-family: var(--font-mono); font-size: 11px; }
  .feedback .fb-cycles { margin-top: 6px; font-size: 10px; opacity: .65; font-family: var(--font-mono); }

  /* ── Zone de boutons du bas ──────────────────────────────── */
  .btn-row {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Bouton Valider */
  .validate-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px 14px;
    background: var(--green);
    color: #0a1a0a;
    font-weight: 700;
    font-size: 13px;
    font-family: var(--font-ui);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: opacity .12s, transform .08s;
  }
  .validate-btn:hover   { opacity: .88; }
  .validate-btn:active  { transform: scale(.97); }
  .validate-btn:disabled { opacity: .3; cursor: not-allowed; transform: none; }
  .validate-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

  /* Bouton Défi suivant — caché par défaut, visible après succès */
  .next-btn {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px 14px;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    font-family: var(--font-ui);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity .12s, transform .08s;
    flex-shrink: 0;
  }
  .next-btn:hover  { opacity: .88; }
  .next-btn:active { transform: scale(.97); }
  .next-btn.visible { display: flex; }
  .next-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

  /* Quand le défi suivant est visible, le bouton valider rétrécit */
  .btn-row.has-next .validate-btn { flex: 0 0 auto; padding: 11px 12px; }

  /* ── Resize ──────────────────────────────────────────────── */
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

  ::-webkit-scrollbar       { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-4); border-radius: 3px; }
`;

import { makeDraggable, makeResizable } from './chuck-display.js';

export class ChuckChallengePanel extends ChuckComponent {
  private _challenge:   Challenge | null = null;
  private _totalCount   = 30;           // nombre total de défis
  private _hintStates:  boolean[] = [];

  protected render(): void {
    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="modal-bar" id="bar">
      <span class="modal-title">Consigne</span>
      <button class="close-btn" id="close">✕</button>
    </div>
    <div class="body" id="body">
      <div class="description" style="color:var(--text-muted);font-style:italic">
        Chargement du défi…
      </div>
    </div>
    <div class="resize-handle" id="resize"></div>`;
  }

  protected setup(): void {
    this.shadow.getElementById('close')!
      .addEventListener('click', () => this.hide());

    makeDraggable(this, this.shadow.getElementById('bar')!);
    makeResizable(this, this.shadow.getElementById('resize')!);

    this.sub('chuck:challenge-loaded', ({ challenge }) => {
      this._challenge  = challenge;
      this._hintStates = (challenge.hints ?? []).map(() => false);
      this._renderChallenge();
    });

    this.sub('chuck:challenge-success', ({ result }) => this._showFeedback(result, true));
    this.sub('chuck:challenge-failed',  ({ result }) => this._showFeedback(result, false));
    this.sub('chuck:code-changed',      ()           => this._resetFeedback());
  }

  // ── Rendu du défi ─────────────────────────────────────────
  private _renderChallenge(): void {
    if (!this._challenge) return;
    const c = this._challenge;

    const zaksHtml = c.meta?.zaks ? `
      <div class="zaks-ref">
        <span class="zaks-icon">📖</span>
        <div class="zaks-text">
          ${c.meta.zaks.chapter}, p.&nbsp;${c.meta.zaks.page}<br>
          <strong>${c.meta.zaks.topic}</strong>
        </div>
      </div>` : '';

    const conceptsHtml = (c.meta?.concepts?.length ?? 0) > 0 ? `
      <div class="concepts">
        ${c.meta!.concepts!.map(t => `<span class="concept-tag">${t}</span>`).join('')}
      </div>` : '';

    const hintsHtml = (c.hints?.length ?? 0) > 0 ? `
      <div class="hints-section">
        <div class="hints-label">Indices (${c.hints!.length})</div>
        ${c.hints!.map((h, i) => `
          <div class="hint-item hidden-hint" data-hint="${i}">
            <span class="hint-placeholder">💡 Cliquer pour révéler l'indice ${i + 1}</span>
            <span class="hint-text">${this._escapeHtml(h.text)}</span>
          </div>`).join('')}
      </div>` : '';

    const timeHtml = c.meta?.estimatedMinutes
      ? `<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">~${c.meta.estimatedMinutes} min</span>`
      : '';

    const isLast = c.id >= this._totalCount;

    this.shadow.getElementById('body')!.innerHTML = `
      <div>
        <div class="challenge-day">Jour ${c.id} / ${this._totalCount} ${timeHtml}</div>
        <div class="challenge-title">${this._escapeHtml(c.title)}</div>
      </div>

      ${zaksHtml}

      <div class="description">${this._renderMarkdown(c.description)}</div>

      ${conceptsHtml}

      ${hintsHtml ? `<div class="sep"></div>${hintsHtml}` : ''}

      <div class="sep"></div>

      <div class="feedback" id="feedback"></div>

      <div class="btn-row" id="btn-row">
        <button class="validate-btn" id="validate-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Valider le défi
        </button>
        ${!isLast ? `
        <button class="next-btn" id="next-btn" title="Défi suivant">
          Défi ${c.id + 1}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>` : ''}
      </div>
    `;

    // Bouton Valider
    this.shadow.getElementById('validate-btn')!
      .addEventListener('click', () => this._triggerValidation());

    // Bouton Défi suivant
    this.shadow.getElementById('next-btn')
      ?.addEventListener('click', () => this._goNext());

    // Hints
    this.shadow.querySelectorAll('.hint-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset['hint'] ?? '0', 10);
        if (!this._hintStates[idx]) {
          this._hintStates[idx] = true;
          el.classList.remove('hidden-hint');
          el.classList.add('revealed');
        }
      });
    });
  }

  // ── Navigation ────────────────────────────────────────────
  private _goNext(): void {
    if (!this._challenge) return;
    const nextId = this._challenge.id + 1;
    if (nextId > this._totalCount) return;

    // Émettre l'événement — ChallengeManager charge le défi et met à jour l'URL
    this.emit('chuck:goto-challenge', { id: nextId });
  }

  // ── Validation ────────────────────────────────────────────
  private _triggerValidation(): void {
    const editorEl = document.getElementById('editor') as
      (HTMLElement & { getSource?: () => string }) | null;
    const source = editorEl?.getSource?.() ?? '';
    if (!source.trim()) return;

    const btn = this.shadow.getElementById('validate-btn') as HTMLButtonElement;
    btn.disabled    = true;
    btn.textContent = 'Validation…';

    requestAnimationFrame(() => {
      this.emit('chuck:validate', { source });
      btn.disabled  = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Valider le défi`;
    });
  }

  // ── Feedback ──────────────────────────────────────────────
  private _showFeedback(result: ValidationResult, success: boolean): void {
    const feedbackEl = this.shadow.getElementById('feedback');
    const btnRow     = this.shadow.getElementById('btn-row');
    const nextBtn    = this.shadow.getElementById('next-btn');
    if (!feedbackEl) return;

    if (success) {
      feedbackEl.className = 'feedback success';
      feedbackEl.innerHTML = `
        <div class="fb-title">✓ Défi réussi !</div>
        <div class="fb-cycles">${result.cycles} cycle(s) CPU</div>`;

      // Révéler le bouton "Défi suivant" si pas dernier défi
      if (nextBtn && this._challenge && this._challenge.id < this._totalCount) {
        nextBtn.classList.add('visible');
        btnRow?.classList.add('has-next');
      }
    } else {
      const details = result.timeout
        ? 'Programme non terminé (timeout).'
        : result.failures.map(f => `• ${f.message}`).join('<br>');
      feedbackEl.className = 'feedback failure';
      feedbackEl.innerHTML = `
        <div class="fb-title">✗ Défi échoué</div>
        <div class="fb-detail">${details}</div>
        ${result.cycles ? `<div class="fb-cycles">${result.cycles} cycle(s)</div>` : ''}`;
    }

    feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private _resetFeedback(): void {
    const feedbackEl = this.shadow.getElementById('feedback');
    const btnRow     = this.shadow.getElementById('btn-row');
    const nextBtn    = this.shadow.getElementById('next-btn');
    if (feedbackEl) feedbackEl.className = 'feedback';
    if (nextBtn)    nextBtn.classList.remove('visible');
    if (btnRow)     btnRow.classList.remove('has-next');
  }

  // ── Markdown minimal ──────────────────────────────────────
  private _renderMarkdown(md: string): string {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.)/s, '<p>$1')
      .replace(/(.)$/s, '$1</p>');
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Visibilité ────────────────────────────────────────────
  show():   void { this.classList.add('visible'); }
  hide():   void { this.classList.remove('visible'); }
  toggle(): void { this.classList.toggle('visible'); }
}

customElements.define('chuck-challenge-panel', ChuckChallengePanel);
