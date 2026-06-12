/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/base-component.ts

   Classe de base pour tous les Web Components de Chuck.
   - Shadow DOM en mode 'open'
   - Gestion automatique des désabonnements Bus
   - Injection des CSS Variables globales dans le Shadow DOM
   ───────────────────────────────────────────────────────────── */

import { bus, type ChuckEventName, type ChuckEventMap } from './bus.js';

export abstract class ChuckComponent extends HTMLElement {
  protected readonly shadow: ShadowRoot;
  private readonly _unsubs: Array<() => void> = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  /** Injecter les CSS variables globales dans le Shadow DOM */
  protected injectGlobalStyles(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = `
      @import url('/src/styles/tokens.css');
      :host { display: block; }
    `;
    this.shadow.appendChild(style);
    return style;
  }

  /** S'abonner au Bus — désinscription automatique à disconnectedCallback */
  protected sub<K extends ChuckEventName>(
    event: K,
    handler: (detail: ChuckEventMap[K]) => void,
  ): void {
    this._unsubs.push(bus.on(event, handler));
  }

  /** Émettre un événement Bus */
  protected emit<K extends ChuckEventName>(
    event: K,
    detail: ChuckEventMap[K],
  ): void {
    bus.emit(event, detail);
  }

  connectedCallback(): void {
    this.render();
    this.setup();
  }

  disconnectedCallback(): void {
    this._unsubs.forEach(fn => fn());
    this._unsubs.length = 0;
    this.teardown();
  }

  /** Construire le shadow DOM — appelé à connectedCallback */
  protected abstract render(): void;

  /** Brancher les listeners après render — override optionnel */
  protected setup(): void {}

  /** Nettoyage optionnel à disconnectedCallback */
  protected teardown(): void {}
}
