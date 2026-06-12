/* ─────────────────────────────────────────────────────────────
   Chuck IDE — components/chuck-challenge-panel.ts
   Panneau consigne fixe (aside) intégré dans le layout.
   Navigation ‹ › dans le header. Bouton Valider en bas.
   ───────────────────────────────────────────────────────────── */

import { ChuckComponent } from '../core/base-component.js';
import type { Challenge, ValidationResult } from '../types/challenge.js';

const STYLES = /* css */`
  @import '/src/styles/tokens.css';

  :host {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    overflow: hidden;
    height: 100%;
  }

  /* ── Header avec navigation ────────────────────────────── */
  .panel-header {
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 6px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
  }
  .panel-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: .08em;
    flex: 1;
    text-align: center;
  }
  .nav-btn {
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 700;
    background: none; border: none; cursor: pointer;
    color: var(--text-muted);
    transition: background var(--t-fast), color var(--t-fast);
    flex-shrink: 0;
  }
  .nav-btn:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
  .nav-btn:disabled { opacity: .2; cursor: default; }
  /* Bouton suivant devient vert après succès */
  .nav-btn.next-success { color: var(--green); }

  /* ── Corps scrollable ────────────────────────────────── */
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  /* ── En-tête défi ────────────────────────────────────── */
  .challenge-day {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
  }
  .challenge-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.35;
    margin-top: 2px;
  }

  /* ── Description ─────────────────────────────────────── */
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
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: .06em;
    margin: 10px 0 4px;
  }
  .description ul { padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }

  /* ── Référence Zaks ──────────────────────────────────── */
  .zaks-ref {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
    font-size: 11px;
  }
  .zaks-icon { font-size: 14px; flex-shrink: 0; padding-top: 1px; }
  .zaks-text { color: var(--text-dim); line-height: 1.5; }
  .zaks-text strong { color: var(--text); font-size: 10px; }

  /* ── Concepts ────────────────────────────────────────── */
  .concepts { display: flex; flex-wrap: wrap; gap: 5px; }
  .concept-tag {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--cyan-dim);
    color: var(--cyan);
    border: 1px solid rgba(56,189,248,.2);
  }

  /* ── Hints ───────────────────────────────────────────── */
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
  .hint-item.revealed { cursor: default; color: var(--amber); border-color: rgba(251,191,36,.2); background: var(--amber-dim); }
  .hint-item.hidden-hint .hint-text        { display: none; }
  .hint-item.hidden-hint .hint-placeholder { display: block; }
  .hint-item .hint-placeholder { color: var(--text-muted); font-style: italic; }
  .hint-item.revealed .hint-placeholder    { display: none; }
  .hint-item.revealed .hint-text           { display: block; }

  /* ── Séparateur ──────────────────────────────────────── */
  .sep { height: 1px; background: var(--border); margin: 0 -16px; }

  /* ── Feedback ────────────────────────────────────────── */
  .feedback { padding: 10px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; display: none; }
  .feedback.success { display: block; background: var(--green-dim); border: 1px solid rgba(61,214,140,.3); color: var(--green); }
  .feedback.failure { display: block; background: var(--red-dim);   border: 1px solid rgba(248,113,113,.3); color: var(--red); }
  .feedback .fb-title  { font-weight: 700; margin-bottom: 4px; font-size: 13px; }
  .feedback .fb-detail { opacity: .85; font-family: var(--font-mono); font-size: 11px; }
  .feedback .fb-cycles { margin-top: 6px; font-size: 10px; opacity: .65; font-family: var(--font-mono); }

  /* ── Bouton Valider ──────────────────────────────────── */
  .validate-btn {
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
    width: 100%;
  }
  .validate-btn:hover   { opacity: .88; }
  .validate-btn:active  { transform: scale(.98); }
  .validate-btn:disabled { opacity: .3; cursor: not-allowed; transform: none; }
  .validate-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

  ::-webkit-scrollbar       { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-4); border-radius: 3px; }
`;

export class ChuckChallengePanel extends ChuckComponent {
  private _challenge:   Challenge | null = null;
  private _totalCount   = 30;
  private _hintStates:  boolean[] = [];

  protected render(): void {
    this.shadow.innerHTML = `<style>${STYLES}</style>
    <div class="panel-header">
      <span class="panel-title" id="panel-title">Consigne</span>
    </div>
    <div class="body" id="body">
      <div class="description" style="color:var(--text-muted);font-style:italic;padding-top:20px;text-align:center">
        Lance un défi depuis l'URL<br>?challenge=1
      </div>
    </div>`;
  }

  protected setup(): void {
    this.sub('chuck:challenge-loaded', ({ challenge }) => {
      this._challenge  = challenge;
      this._hintStates = (challenge.hints ?? []).map(() => false);
      this._renderChallenge();
      // this._updateNav();
    });

    this.sub('chuck:challenge-success', ({ result }) => this._showFeedback(result, true));
    this.sub('chuck:challenge-failed',  ({ result }) => this._showFeedback(result, false));
    this.sub('chuck:code-changed',      ()           => this._resetFeedback());
  }

  // ── Rendu du contenu ────────────────────────────────────
  private _renderChallenge(): void {
    if (!this._challenge) return;
    const c = this._challenge;

    // Titre dans le header
    const t = this.shadow.getElementById('panel-title');
    if (t) t.textContent = `Jour ${c.id} / ${this._totalCount}`;

    const timeHtml = c.meta?.estimatedMinutes
      ? `~${c.meta.estimatedMinutes} min`
      : '';

    // const zaksHtml = c.meta?.zaks ? `
    //   <div class="zaks-ref">
    //     <span class="zaks-icon">📖</span>
    //     <div class="zaks-text">
    //       ${c.meta.zaks.chapter}, p.&nbsp;${c.meta.zaks.page}<br>
    //       <strong>${this._esc(c.meta.zaks.topic)}</strong>
    //     </div>
    //   </div>` : '';

    const conceptsHtml = (c.meta?.concepts?.length ?? 0) > 0 ? `
      <div class="concepts">
        ${c.meta!.concepts!.map(x => `<span class="concept-tag">${x}</span>`).join('')}
      </div>` : '';

    const hintsHtml = (c.hints?.length ?? 0) > 0 ? `
      <div class="sep"></div>
      <div>
        <div class="hints-label">Indices (${c.hints!.length})</div>
        ${c.hints!.map((h, i) => `
          <div class="hint-item hidden-hint" data-hint="${i}">
            <span class="hint-placeholder">💡 Indice ${i + 1} — cliquer pour révéler</span>
            <span class="hint-text">${this._esc(h.text)}</span>
          </div>`).join('')}
      </div>` : '';

    this.shadow.getElementById('body')!.innerHTML = `
      <div>
        <div class="challenge-day">${timeHtml}</div>
        <div class="challenge-title">${this._esc(c.title)}</div>
      </div>
      
      <div class="description">${this._md(c.description)}</div>
      ${conceptsHtml}
      ${hintsHtml}
      <div class="sep"></div>
      <div class="feedback" id="feedback"></div>
      <button class="validate-btn" id="validate-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Valider le défi
      </button>
    `;

    this.shadow.getElementById('validate-btn')!
      .addEventListener('click', () => this._validate());

    this.shadow.querySelectorAll('.hint-item').forEach(el => {
      el.addEventListener('click', () => {
        const i = parseInt((el as HTMLElement).dataset['hint'] ?? '0', 10);
        if (!this._hintStates[i]) {
          this._hintStates[i] = true;
          el.classList.remove('hidden-hint');
          el.classList.add('revealed');
        }
      });
    });
  }

  // ── Navigation prev/next ─────────────────────────────────
  // private _updateNav(): void {
  //   const prev = this.shadow.getElementById('prev-btn') as HTMLButtonElement;
  //   const next = this.shadow.getElementById('next-btn') as HTMLButtonElement;
  //   if (!this._challenge) return;
  //   prev.disabled = this._challenge.id <= 1;
  //   next.disabled = this._challenge.id >= this._totalCount;
  //   next.classList.remove('next-success');
  // }

  // ── Validation ───────────────────────────────────────────
  private _validate(): void {
    const editor = document.getElementById('editor') as (HTMLElement & { getSource?(): string }) | null;
    const source = editor?.getSource?.() ?? '';
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

  // ── Feedback ─────────────────────────────────────────────
  private _showFeedback(result: ValidationResult, success: boolean): void {
    const el   = this.shadow.getElementById('feedback');
    const next = this.shadow.getElementById('next-btn') as HTMLButtonElement | null;
    if (!el) return;

    if (success) {
      el.className = 'feedback success';
      el.innerHTML = `
        <div class="fb-title">✓ Défi réussi !</div>
        <div class="fb-cycles">${result.cycles} cycle(s) CPU</div>`;
      // Mettre le bouton suivant en vert si pas le dernier défi
      if (next && this._challenge && this._challenge.id < this._totalCount) {
        next.disabled = false;
        next.classList.add('next-success');
      }
    } else {
      const details = result.timeout
        ? 'Programme non terminé (timeout).'
        : result.failures.map(f => `• ${f.message}`).join('<br>');
      el.className = 'feedback failure';
      el.innerHTML = `
        <div class="fb-title">✗ Défi échoué</div>
        <div class="fb-detail">${details}</div>
        ${result.cycles ? `<div class="fb-cycles">${result.cycles} cycle(s)</div>` : ''}`;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private _resetFeedback(): void {
    const el   = this.shadow.getElementById('feedback');
    // const next = this.shadow.getElementById('next-btn') as HTMLButtonElement | null;
    if (el)   el.className = 'feedback';
    // if (next) { next.classList.remove('next-success'); this._updateNav(); }
  }

  // ── Markdown minimal ──────────────────────────────────────
  private _md(s: string): string {
    return s
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.)/s, '<p>$1')
      .replace(/(.)$/s, '$1</p>');
  }

  private _esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

customElements.define('chuck-challenge-panel', ChuckChallengePanel);