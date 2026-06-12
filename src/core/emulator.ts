/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/emulator.ts
   Façade principale de l'émulateur.

   Remplace emulator-bridge.ts.
   Instancie et relie : Ram64K → Cpu6502 + Assembler6502 + Display6502
   Traduit toutes les commandes Bus en appels CPU/assembleur.
   Émet chuck:cpu-reset conforme à la tâche 2.2.
   ───────────────────────────────────────────────────────────── */

import { bus }           from './bus.js';
import { Ram64K }         from './memory.js';
import { Display6502 }    from './display.js';
import { Assembler6502 }  from './assembler.js';
import { Cpu6502 }        from './cpu.js';
import type { CpuState }  from '../types/cpu.js';

const addr2hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();

export class Emulator {
  // ── Sous-systèmes ────────────────────────────────────────
  readonly ram:       Ram64K;
  readonly cpu:       Cpu6502;
  readonly display:   Display6502;
  readonly assembler: Assembler6502;

  private _lastCodeLen = 0;
  private _unsubs: Array<() => void> = [];

  constructor() {
    this.ram       = new Ram64K();
    this.cpu       = new Cpu6502(this.ram);
    this.display   = new Display6502();
    this.assembler = new Assembler6502();

    // Câbler les callbacks CPU → Bus
    this.cpu.setCallbacks({
      onStep:  (state) => bus.emit('chuck:cpu-updated', state),
      onHalt:  (state, status) => this._onCpuHalt(state, status),
      onError: (msg)  => bus.emit('chuck:cpu-error', { msg }),
    });

    this._bindBus();
  }

  // ── Initialisation canvas ────────────────────────────────

  initDisplay(canvas: HTMLCanvasElement): void {
    this.display.init(canvas, this.ram);
    this._performReset();
    document.addEventListener('keypress', (e) => {
      this.ram.storeKeypress(e.which ?? e.keyCode);
    });
    bus.emit('chuck:log', {
      text:  'Émulateur 6502 prêt. $0200–$05FF = écran | $FE = rand | $FF = touche',
      level: 'dim',
    });
  }

  destroy(): void {
    this._unsubs.forEach(fn => fn());
    this.cpu.stop();
    this.display.destroy();
  }

  // ── Reset (Tâche 2.2) ────────────────────────────────────

  private _performReset(): void {
    this.cpu.reset();
    this.display.clear();
    this._lastCodeLen = 0;
    const state = this.cpu.getState();
    bus.emit('chuck:cpu-reset', state);
    bus.emit('chuck:log', { text: '↺ CPU réinitialisé', level: 'info' });
  }

  // ── Assemblage ───────────────────────────────────────────

  private _assemble(source: string): void {
    this.cpu.stop();
    this.cpu.reset();
    this.display.clear();

    const result = this.assembler.assemble(source, this.ram);

    if (result.ok) {
      this._lastCodeLen = result.bytes;
      bus.emit('chuck:assembled', result);
      bus.emit('chuck:cpu-updated', this.cpu.getState());
      bus.emit('chuck:log', {
        text:  `✓ Assemblé — ${result.bytes} octet(s) → $0600–$${addr2hex(0x0600 + result.bytes - 1)}`,
        level: 'ok',
      });
    } else {
      bus.emit('chuck:assemble-err', { line: result.line ?? 0, err: result.err ?? '' });
      bus.emit('chuck:log', {
        text:  `✗ Erreur L${result.line} : ${result.err}`,
        level: 'err',
      });
    }
  }

  // ── Callbacks CPU ────────────────────────────────────────

  private _onCpuHalt(state: CpuState, status: 'halted' | 'paused' | 'error'): void {
    this.display.redraw();      // Rafraîchir l'écran une dernière fois
    bus.emit('chuck:cpu-halted', state);
    if (status === 'halted') {
      bus.emit('chuck:log', { text: `● Programme terminé (BRK) — PC=$${addr2hex(state.PC)}`, level: 'ok' });
    } else if (status === 'paused') {
      bus.emit('chuck:log', { text: `⏸ Pausé — PC=$${addr2hex(state.PC)}`, level: 'info' });
    }
  }

  // ── Wiring Bus ────────────────────────────────────────────

  private _bindBus(): void {
    const sub = <K extends Parameters<typeof bus.on>[0]>(
      ev: K, fn: Parameters<typeof bus.on<K>>[1],
    ) => this._unsubs.push(bus.on(ev, fn));

    sub('chuck:assemble',    ({ source }) => this._assemble(source));

    sub('chuck:run',         () => {
      this.cpu.start();
      bus.emit('chuck:log', { text: '▶ Exécution démarrée', level: 'info' });
    });

    sub('chuck:stop',        () => {
      this.cpu.stop();
      bus.emit('chuck:cpu-updated', this.cpu.getState());
      bus.emit('chuck:log', { text: '■ Arrêté', level: 'info' });
    });

    sub('chuck:step', () => {
      // Lire le PC et désassembler l'instruction AVANT exécution
      const pcBefore   = this.cpu.getState().PC;
      const instrLabel = this.assembler.disassembleOne(this.ram, pcBefore);

      this.cpu.stepOnce();

      bus.emit('chuck:log', {
        text:  `→ Step — PC=$${addr2hex(pcBefore)}  ${instrLabel}`,
        level: 'info',
      });
    });

    sub('chuck:reset',       () => this._performReset());

    sub('chuck:goto',        ({ address }) => {
      this.cpu.gotoAddr(address);
      bus.emit('chuck:cpu-updated', this.cpu.getState());
      bus.emit('chuck:log', { text: `⤷ PC → $${addr2hex(address)}`, level: 'info' });
    });

    sub('chuck:hexdump',     () => {
      const len = Math.max(this._lastCodeLen, 64);
      const raw = this.ram.hexDump(0x0600, len);
      bus.emit('chuck:log', { text: `— Hexdump $0600 (${len} octets) —`, level: 'hex' });
      raw.split('\n').forEach(l => bus.emit('chuck:log', { text: l, level: 'hex' }));
    });

    sub('chuck:disassemble', () => {
      const len = Math.max(this._lastCodeLen, 32);
      const out = this.assembler.disassemble(this.ram, 0x0600, len);
      bus.emit('chuck:log', { text: '— Désassemblage $0600 —', level: 'hex' });
      out.split('\n').forEach(l => bus.emit('chuck:log', { text: l, level: 'hex' }));
    });

    sub('chuck:speed',       ({ value }) => this.cpu.setSpeed(value));

    sub('chuck:debug',       ({ enabled }) => {
      this.cpu.setDebug(enabled);
      bus.emit('chuck:log', { text: `Mode debug : ${enabled ? 'activé' : 'désactivé'}`, level: 'info' });
    });

    // Répondre aux demandes de lecture mémoire de l'UI
    sub('chuck:memory-read', ({ address, length }) => {
      const bytes = this.ram.buffer.slice(address, address + length);
      bus.emit('chuck:memory-data', { address, bytes });
    });
  }
}