/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/emulator-bridge.ts

   Pont TypeScript autour du moteur simulator.js (ES5/vanillaJS).
   Encapsule Memory, CPU, Assembler, Display dans une interface
   TypeScript propre sans toucher au moteur existant.

   simulator.js est chargé via un <script> classique dans index.html
   et expose ses objets sur window. Ce bridge les consomme de
   manière typée et relaie tout via le Bus.
   ───────────────────────────────────────────────────────────── */

import { bus, type CpuState, type AssembleResult } from './bus.js';

/* ── Déclarations ambiantes des globales de simulator.js ─────── */
declare global {
  const Memory: {
    reset():                           void;
    get(addr: number):                 number;
    set(addr: number, val: number):    void;
    storeByte(addr: number, val: number): void;
    getWord(addr: number):             number;
    format(start: number, len: number): string;
    storeKeypress(e: KeyboardEvent):   void;
  };

  const Display: {
    init(canvas: HTMLCanvasElement):   void;
    clear():                           void;
    updatePixel(addr: number):         void;
  };

  const CPU: {
    reset():    void;
    start():    void;
    stop():     void;
    stepOnce(): void;
    setSpeed(percent: number): void;
    gotoAddr(addr: number):    void;
    getState(): CpuState & { running: boolean; debugMode: boolean };
    emitRegs(): void;
  };

  const Assembler: {
    assemble(source: string): AssembleResult;
    hexdump(length: number):  string;
    disassemble(start: number, length: number): string;
  };

  function initSimulator(): void;
}

/* ── Bridge ──────────────────────────────────────────────────── */
export class EmulatorBridge {
  private lastCodeLength = 0;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    this.bindBusEvents();
  }

  /** Appeler une fois le canvas monté et simulator.js chargé */
  init(canvas: HTMLCanvasElement): void {
    Display.init(canvas);
    CPU.reset();
    document.addEventListener('keypress', (e) => Memory.storeKeypress(e));
    bus.emit('chuck:log', {
      text:  'Moteur 6502 initialisé. $0200–$05FF = écran | $FE = rand | $FF = touche',
      level: 'dim',
    });
  }

  destroy(): void {
    this.unsubscribers.forEach(fn => fn());
  }

  private reg(state = CPU.getState()): CpuState {
    const { A, X, Y, P, PC, SP } = state;
    return { A, X, Y, P, PC, SP };
  }

  /* ── Wiring Bus → CPU/Assembler ────────────────────────────── */
  private bindBusEvents(): void {
    const sub = <K extends Parameters<typeof bus.on>[0]>(
      ev: K,
      fn: Parameters<typeof bus.on<K>>[1],
    ) => this.unsubscribers.push(bus.on(ev, fn));

    sub('chuck:assemble', ({ source }) => this.assemble(source));
    sub('chuck:run',      ()  => this.run());
    sub('chuck:stop',     ()  => this.stop());
    sub('chuck:step',     ()  => this.step());
    sub('chuck:reset',    ()  => this.reset());
    sub('chuck:goto',     ({ address }) => this.goto(address));
    sub('chuck:hexdump',  ()  => this.hexdump());
    sub('chuck:disassemble', () => this.disasm());
    sub('chuck:speed',    ({ value }) => CPU.setSpeed(value));
    sub('chuck:debug',    ({ enabled }) => {
      bus.emit('chuck:log', {
        text:  `Mode debug : ${enabled ? 'activé' : 'désactivé'}`,
        level: 'info',
      });
    });
  }

  /* ── Actions ─────────────────────────────────────────────── */
  private assemble(source: string): void {
    CPU.reset();
    const result = Assembler.assemble(source);
    if (result.ok) {
      this.lastCodeLength = result.bytes;
      bus.emit('chuck:assembled', result);
      bus.emit('chuck:cpu-updated', this.reg());
      bus.emit('chuck:log', {
        text:  `✓ Assemblé — ${result.bytes} octet(s) → $0600`,
        level: 'ok',
      });
    } else {
      bus.emit('chuck:assemble-err', {
        line: result.line ?? 0,
        err:  result.err ?? 'Erreur inconnue',
      });
      bus.emit('chuck:log', {
        text:  `✗ Erreur L${result.line} : ${result.err}`,
        level: 'err',
      });
    }
  }

  private run(): void {
    CPU.start();
    bus.emit('chuck:log', { text: '▶ Exécution démarrée à $0600', level: 'info' });
  }

  private stop(): void {
    CPU.stop();
    bus.emit('chuck:cpu-updated', this.reg());
    bus.emit('chuck:log', { text: '■ Arrêté', level: 'info' });
  }

  private step(): void {
    CPU.stepOnce();
    const state = CPU.getState();
    bus.emit('chuck:cpu-updated', this.reg(state));
    bus.emit('chuck:log', {
      text:  `→ Step — PC=$${state.PC.toString(16).padStart(4,'0').toUpperCase()}`,
      level: 'info',
    });
  }

  private reset(): void {
    CPU.reset();
    this.lastCodeLength = 0;
    bus.emit('chuck:cpu-reset', this.reg());
    bus.emit('chuck:log', { text: '↺ CPU réinitialisé', level: 'info' });
  }

  private goto(addr: number): void {
    CPU.gotoAddr(addr);
    bus.emit('chuck:cpu-updated', this.reg());
    bus.emit('chuck:log', {
      text:  `⤷ PC → $${addr.toString(16).padStart(4,'0').toUpperCase()}`,
      level: 'info',
    });
  }

  private hexdump(): void {
    const len  = Math.max(this.lastCodeLength, 64);
    const dump = Assembler.hexdump(len);
    bus.emit('chuck:log', {
      text: `— Hexdump $0600 (${len} octets) —`,
      level: 'hex',
    });
    dump.split('\n').forEach(l =>
      bus.emit('chuck:log', { text: l, level: 'hex' }),
    );
  }

  private disasm(): void {
    const len = Math.max(this.lastCodeLength, 32);
    const out = Assembler.disassemble(0x600, len);
    bus.emit('chuck:log', { text: '— Désassemblage $0600 —', level: 'hex' });
    out.split('\n').forEach(l =>
      bus.emit('chuck:log', { text: l, level: 'hex' }),
    );
  }
}