/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/cpu.ts
   Tâche 2.1 + 2.2 — Cpu6502

   Processeur MOS 6502 complet.
   - Classe pure : aucune dépendance à l'UI ni au Bus
   - Injection de dépendance : reçoit une Ram64K
   - Méthode .reset() conforme à la tâche 2.2
   - Utilisable en mode headless (validation de défi)
   - 151 opcodes officiels + ADC/SBC BCD correct
   ───────────────────────────────────────────────────────────── */

import type { Ram64K }   from './memory.js';
import { FLAGS, CPU_RESET_STATE, type CpuState, type MachineStatus } from '../types/cpu.js';

// Callback émis à chaque changement d'état
export type CpuListener = (state: CpuState) => void;
export type HaltListener = (state: CpuState, status: 'halted' | 'paused' | 'error') => void;

export class Cpu6502 {
  // ── Registres ────────────────────────────────────────────
  private _A  = 0;
  private _X  = 0;
  private _Y  = 0;
  private _P  = 0x20;
  private _PC = 0x0600;
  private _SP = 0xff;

  // ── État interne ─────────────────────────────────────────
  private _status:  MachineStatus = 'idle';
  private _ram:     Ram64K;
  private _rafId:   number | null = null;
  private _timerId: ReturnType<typeof setTimeout> | null = null;
  private _speedMs  = 0;            // 0 = max vitesse (rAF batch)
  private _debugMode = false;

  // ── Callbacks ─────────────────────────────────────────────
  private _onStep?:  CpuListener;
  private _onHalt?:  HaltListener;
  private _onError?: (msg: string) => void;

  constructor(ram: Ram64K) {
    this._ram = ram;
  }

  // ── API publique ──────────────────────────────────────────

  /** Injecter les callbacks (appelés sans couplage au Bus) */
  setCallbacks(cb: {
    onStep?:  CpuListener;
    onHalt?:  HaltListener;
    onError?: (msg: string) => void;
  }): void {
    this._onStep  = cb.onStep;
    this._onHalt  = cb.onHalt;
    this._onError = cb.onError;
  }

  /**
   * Tâche 2.2 — Reset
   * Remet les registres à l'état initial, vide la RAM, efface l'écran.
   * N'émet PAS le Bus directement — c'est Emulator.ts qui le fait.
   */
  reset(): void {
    this._stop();
    this._A  = CPU_RESET_STATE.A;
    this._X  = CPU_RESET_STATE.X;
    this._Y  = CPU_RESET_STATE.Y;
    this._P  = CPU_RESET_STATE.P;
    this._PC = CPU_RESET_STATE.PC;
    this._SP = CPU_RESET_STATE.SP;
    this._status = 'idle';
    this._ram.reset();
  }

  /** Démarrer l'exécution continue */
  start(): void {
    if (this._status === 'running') return;
    this._status = 'running';
    if (this._speedMs <= 0) {
      this._rafLoop();
    } else {
      this._timerLoop();
    }
  }

  /** Stopper l'exécution */
  stop(): void {
    this._stop();
    if (this._status === 'running') this._status = 'paused';
  }

  /** Exécuter une seule instruction (mode debug step) */
  stepOnce(): void {
    if (this._status === 'running') return;
    this._execOne();
    this._onStep?.(this.getState());
  }

  /**
   * Mode headless pour la validation de défi.
   * Exécute jusqu'à BRK ou maxCycles — synchrone, pas d'UI.
   * Retourne le nombre de cycles effectués.
   */
  runSync(maxCycles = 10_000): { cycles: number; halted: boolean } {
    let cycles = 0;
    this._status = 'running';
    while (this._status === 'running' && cycles < maxCycles) {
      this._execOne();
      cycles++;
    }
    return { cycles, halted: (this._status as string) === 'halted' };
  }

  /** Aller à une adresse PC (goto) */
  gotoAddr(addr: number): void {
    this._PC = addr & 0xffff;
  }

  /** Vitesse d'exécution : 1–100 %, 95+ = max */
  setSpeed(percent: number): void {
    this._speedMs = percent >= 95 ? 0 : Math.round(2000 / percent) - 1;
  }

  /** Activer / désactiver le mode debug (step-by-step) */
  setDebug(on: boolean): void {
    this._debugMode = on;
  }

  /** Snapshot des registres */
  getState(): CpuState {
    return { A: this._A, X: this._X, Y: this._Y, P: this._P, PC: this._PC, SP: this._SP };
  }

  get status(): MachineStatus { return this._status; }

  // ── Boucle d'exécution ────────────────────────────────────

  private _rafLoop(): void {
    const tick = () => {
      if (this._status !== 'running') return;
      // ~500 instructions par frame à 60fps ≈ 30 000 instructions/s
      for (let i = 0; i < 500 && this._status === 'running'; i++) {
        this._execOne();
      }
      this._onStep?.(this.getState());
      if (this._status === 'running') {
        this._rafId = requestAnimationFrame(tick);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _timerLoop(): void {
    const tick = () => {
      if (this._status !== 'running') return;
      this._execOne();
      this._onStep?.(this.getState());
      if (this._status === 'running') {
        this._timerId = setTimeout(tick, this._speedMs);
      }
    };
    this._timerId = setTimeout(tick, this._speedMs);
  }

  private _stop(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._timerId !== null) { clearTimeout(this._timerId); this._timerId = null; }
  }

  // ── Fetch / decode ────────────────────────────────────────

  private _fetch(): number {
    const b = this._ram.read(this._PC);
    this._PC = (this._PC + 1) & 0xffff;
    return b;
  }

  private _fetchWord(): number {
    const lo = this._fetch();
    const hi = this._fetch();
    return lo | (hi << 8);
  }

  // ── Flags ─────────────────────────────────────────────────

  private _f(flag: number): boolean   { return (this._P & flag) !== 0; }
  private _sf(flag: number): void     { this._P |= flag; }
  private _cf(flag: number): void     { this._P &= ~flag; }
  private _pf(flag: number, v: boolean | number): void {
    v ? this._sf(flag) : this._cf(flag);
  }

  private _setNZ(val: number): void {
    this._pf(FLAGS.Z, (val & 0xff) === 0);
    this._pf(FLAGS.N, (val & 0x80) !== 0);
  }

  // ── Stack ─────────────────────────────────────────────────

  private _push(v: number): void {
    this._ram.write(0x100 + this._SP, v & 0xff);
    this._SP = (this._SP - 1) & 0xff;
  }

  private _pop(): number {
    this._SP = (this._SP + 1) & 0xff;
    return this._ram.read(0x100 + this._SP);
  }

  // ── ADC / SBC ─────────────────────────────────────────────

  private _adc(val: number): void {
    const c = this._f(FLAGS.C) ? 1 : 0;
    if (this._f(FLAGS.D)) {
      // BCD
      let lo = (this._A & 0x0f) + (val & 0x0f) + c;
      if (lo >= 10) lo = 0x10 | ((lo + 6) & 0x0f);
      let result = (this._A & 0xf0) + (val & 0xf0) + lo;
      this._pf(FLAGS.V, !((this._A ^ val) & 0x80) && !!((this._A ^ result) & 0x80));
      if (result >= 160) { this._sf(FLAGS.C); result += 0x60; } else this._cf(FLAGS.C);
      this._setNZ(result);
      this._A = result & 0xff;
    } else {
      const sum = this._A + val + c;
      this._pf(FLAGS.C, sum > 0xff);
      this._pf(FLAGS.V, !((this._A ^ val) & 0x80) && !!((this._A ^ sum) & 0x80));
      this._A = sum & 0xff;
      this._setNZ(this._A);
    }
  }

  private _sbc(val: number): void { this._adc(val ^ 0xff); }

  // ── Compare ───────────────────────────────────────────────

  private _cmp(reg: number, val: number): void {
    this._pf(FLAGS.C, reg >= val);
    this._setNZ((reg - val) & 0xff);
  }

  // ── Branch ────────────────────────────────────────────────

  private _branch(cond: boolean): void {
    const offset = this._fetch();
    if (cond) {
      const rel = offset > 0x7f ? offset - 0x100 : offset;
      this._PC = (this._PC + rel) & 0xffff;
    }
  }

  // ── Instruction principale ────────────────────────────────

  private _execOne(): void {
    const op = this._fetch();
    let addr: number, val: number, lo: number, hi: number, sf: boolean;

    switch (op) {
      // ── BRK ────────────────────────────────────────────
      case 0x00:
        this._status = 'halted';
        this._onHalt?.(this.getState(), 'halted');
        return;

      // ── ORA ────────────────────────────────────────────
      case 0x01: addr=(this._fetch()+this._X)&0xff; this._A|=this._ram.read(this._ram.readWord(addr)); this._setNZ(this._A); break;
      case 0x05: this._A|=this._ram.read(this._fetch()); this._setNZ(this._A); break;
      case 0x09: this._A|=this._fetch(); this._setNZ(this._A); break;
      case 0x0d: this._A|=this._ram.read(this._fetchWord()); this._setNZ(this._A); break;
      case 0x11: lo=this._fetch(); this._A|=this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x15: this._A|=this._ram.read((this._fetch()+this._X)&0xff); this._setNZ(this._A); break;
      case 0x19: this._A|=this._ram.read((this._fetchWord()+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x1d: this._A|=this._ram.read((this._fetchWord()+this._X)&0xffff); this._setNZ(this._A); break;

      // ── ASL ────────────────────────────────────────────
      case 0x0a: this._pf(FLAGS.C,this._A&0x80); this._A=(this._A<<1)&0xff; this._setNZ(this._A); break;
      case 0x06: addr=this._fetch(); val=this._ram.read(addr); this._pf(FLAGS.C,val&0x80); val=(val<<1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x16: addr=(this._fetch()+this._X)&0xff; val=this._ram.read(addr); this._pf(FLAGS.C,val&0x80); val=(val<<1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x0e: addr=this._fetchWord(); val=this._ram.read(addr); this._pf(FLAGS.C,val&0x80); val=(val<<1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x1e: addr=(this._fetchWord()+this._X)&0xffff; val=this._ram.read(addr); this._pf(FLAGS.C,val&0x80); val=(val<<1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;

      // ── PHP / PHA ──────────────────────────────────────
      case 0x08: this._push(this._P|0x30); break;
      case 0x48: this._push(this._A); break;

      // ── Branches ───────────────────────────────────────
      case 0x10: this._branch(!this._f(FLAGS.N)); break; // BPL
      case 0x30: this._branch( this._f(FLAGS.N)); break; // BMI
      case 0x50: this._branch(!this._f(FLAGS.V)); break; // BVC
      case 0x70: this._branch( this._f(FLAGS.V)); break; // BVS
      case 0x90: this._branch(!this._f(FLAGS.C)); break; // BCC
      case 0xb0: this._branch( this._f(FLAGS.C)); break; // BCS
      case 0xd0: this._branch(!this._f(FLAGS.Z)); break; // BNE
      case 0xf0: this._branch( this._f(FLAGS.Z)); break; // BEQ

      // ── Flag ops ───────────────────────────────────────
      case 0x18: this._cf(FLAGS.C); break; // CLC
      case 0x38: this._sf(FLAGS.C); break; // SEC
      case 0xb8: this._cf(FLAGS.V); break; // CLV
      case 0xd8: this._cf(FLAGS.D); break; // CLD
      case 0xf8: this._sf(FLAGS.D); break; // SED
      case 0x58: this._cf(FLAGS.I); break; // CLI
      case 0x78: this._sf(FLAGS.I); break; // SEI

      // ── JSR ────────────────────────────────────────────
      case 0x20:
        addr = this._fetchWord();
        this._push(((this._PC-1)>>8)&0xff);
        this._push((this._PC-1)&0xff);
        this._PC = addr;
        break;

      // ── AND ────────────────────────────────────────────
      case 0x21: addr=(this._fetch()+this._X)&0xff; this._A&=this._ram.read(this._ram.readWord(addr)); this._setNZ(this._A); break;
      case 0x25: this._A&=this._ram.read(this._fetch()); this._setNZ(this._A); break;
      case 0x29: this._A&=this._fetch(); this._setNZ(this._A); break;
      case 0x2d: this._A&=this._ram.read(this._fetchWord()); this._setNZ(this._A); break;
      case 0x31: lo=this._fetch(); this._A&=this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x35: this._A&=this._ram.read((this._fetch()+this._X)&0xff); this._setNZ(this._A); break;
      case 0x39: this._A&=this._ram.read((this._fetchWord()+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x3d: this._A&=this._ram.read((this._fetchWord()+this._X)&0xffff); this._setNZ(this._A); break;

      // ── BIT ────────────────────────────────────────────
      case 0x24: val=this._ram.read(this._fetch()); this._pf(FLAGS.N,val&0x80); this._pf(FLAGS.V,val&0x40); this._pf(FLAGS.Z,!(this._A&val)); break;
      case 0x2c: val=this._ram.read(this._fetchWord()); this._pf(FLAGS.N,val&0x80); this._pf(FLAGS.V,val&0x40); this._pf(FLAGS.Z,!(this._A&val)); break;

      // ── ROL ────────────────────────────────────────────
      case 0x2a: sf=this._f(FLAGS.C); this._pf(FLAGS.C,this._A&0x80); this._A=((this._A<<1)|(sf?1:0))&0xff; this._setNZ(this._A); break;
      case 0x26: addr=this._fetch(); val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&0x80); val=((val<<1)|(sf?1:0))&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x36: addr=(this._fetch()+this._X)&0xff; val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&0x80); val=((val<<1)|(sf?1:0))&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x2e: addr=this._fetchWord(); val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&0x80); val=((val<<1)|(sf?1:0))&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x3e: addr=(this._fetchWord()+this._X)&0xffff; val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&0x80); val=((val<<1)|(sf?1:0))&0xff; this._ram.store(addr,val); this._setNZ(val); break;

      // ── PLP / RTI ──────────────────────────────────────
      case 0x28: this._P=this._pop()|0x20; break;
      case 0x40: this._P=this._pop()|0x20; lo=this._pop(); hi=this._pop(); this._PC=lo|(hi<<8); break;

      // ── EOR ────────────────────────────────────────────
      case 0x41: addr=(this._fetch()+this._X)&0xff; this._A^=this._ram.read(this._ram.readWord(addr)); this._setNZ(this._A); break;
      case 0x45: this._A^=this._ram.read(this._fetch()); this._setNZ(this._A); break;
      case 0x49: this._A^=this._fetch(); this._setNZ(this._A); break;
      case 0x4d: this._A^=this._ram.read(this._fetchWord()); this._setNZ(this._A); break;
      case 0x51: lo=this._fetch(); this._A^=this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x55: this._A^=this._ram.read((this._fetch()+this._X)&0xff); this._setNZ(this._A); break;
      case 0x59: this._A^=this._ram.read((this._fetchWord()+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0x5d: this._A^=this._ram.read((this._fetchWord()+this._X)&0xffff); this._setNZ(this._A); break;

      // ── LSR ────────────────────────────────────────────
      case 0x4a: this._pf(FLAGS.C,this._A&1); this._A>>=1; this._setNZ(this._A); break;
      case 0x46: addr=this._fetch(); val=this._ram.read(addr); this._pf(FLAGS.C,val&1); val>>=1; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x56: addr=(this._fetch()+this._X)&0xff; val=this._ram.read(addr); this._pf(FLAGS.C,val&1); val>>=1; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x4e: addr=this._fetchWord(); val=this._ram.read(addr); this._pf(FLAGS.C,val&1); val>>=1; this._ram.store(addr,val); this._setNZ(val); break;
      case 0x5e: addr=(this._fetchWord()+this._X)&0xffff; val=this._ram.read(addr); this._pf(FLAGS.C,val&1); val>>=1; this._ram.store(addr,val); this._setNZ(val); break;

      // ── JMP ────────────────────────────────────────────
      case 0x4c: this._PC=this._fetchWord(); break;
      case 0x6c: addr=this._fetchWord(); this._PC=this._ram.readWord(addr); break;

      // ── PLA ────────────────────────────────────────────
      case 0x68: this._A=this._pop(); this._setNZ(this._A); break;

      // ── ROR ────────────────────────────────────────────
      case 0x6a: sf=this._f(FLAGS.C); this._pf(FLAGS.C,this._A&1); this._A=(this._A>>1)|(sf?0x80:0); this._setNZ(this._A); break;
      case 0x66: addr=this._fetch(); val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&1); val=(val>>1)|(sf?0x80:0); this._ram.store(addr,val); this._setNZ(val); break;
      case 0x76: addr=(this._fetch()+this._X)&0xff; val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&1); val=(val>>1)|(sf?0x80:0); this._ram.store(addr,val); this._setNZ(val); break;
      case 0x6e: addr=this._fetchWord(); val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&1); val=(val>>1)|(sf?0x80:0); this._ram.store(addr,val); this._setNZ(val); break;
      case 0x7e: addr=(this._fetchWord()+this._X)&0xffff; val=this._ram.read(addr); sf=this._f(FLAGS.C); this._pf(FLAGS.C,val&1); val=(val>>1)|(sf?0x80:0); this._ram.store(addr,val); this._setNZ(val); break;

      // ── ADC ────────────────────────────────────────────
      case 0x61: addr=(this._fetch()+this._X)&0xff; this._adc(this._ram.read(this._ram.readWord(addr))); break;
      case 0x65: this._adc(this._ram.read(this._fetch())); break;
      case 0x69: this._adc(this._fetch()); break;
      case 0x6d: this._adc(this._ram.read(this._fetchWord())); break;
      case 0x71: lo=this._fetch(); this._adc(this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff)); break;
      case 0x75: this._adc(this._ram.read((this._fetch()+this._X)&0xff)); break;
      case 0x79: this._adc(this._ram.read((this._fetchWord()+this._Y)&0xffff)); break;
      case 0x7d: this._adc(this._ram.read((this._fetchWord()+this._X)&0xffff)); break;

      // ── STA ────────────────────────────────────────────
      case 0x81: addr=(this._fetch()+this._X)&0xff; this._ram.store(this._ram.readWord(addr),this._A); break;
      case 0x85: this._ram.store(this._fetch(),this._A); break;
      case 0x8d: this._ram.store(this._fetchWord(),this._A); break;
      case 0x91: lo=this._fetch(); this._ram.store((this._ram.readWord(lo)+this._Y)&0xffff,this._A); break;
      case 0x95: this._ram.store((this._fetch()+this._X)&0xff,this._A); break;
      case 0x99: this._ram.store((this._fetchWord()+this._Y)&0xffff,this._A); break;
      case 0x9d: this._ram.store((this._fetchWord()+this._X)&0xffff,this._A); break;

      // ── STX ────────────────────────────────────────────
      case 0x86: this._ram.store(this._fetch(),this._X); break;
      case 0x8e: this._ram.store(this._fetchWord(),this._X); break;
      case 0x96: this._ram.store((this._fetch()+this._Y)&0xff,this._X); break;

      // ── STY ────────────────────────────────────────────
      case 0x84: this._ram.store(this._fetch(),this._Y); break;
      case 0x8c: this._ram.store(this._fetchWord(),this._Y); break;
      case 0x94: this._ram.store((this._fetch()+this._X)&0xff,this._Y); break;

      // ── Transfers ──────────────────────────────────────
      case 0x88: this._Y=(this._Y-1)&0xff; this._setNZ(this._Y); break; // DEY
      case 0x8a: this._A=this._X; this._setNZ(this._A); break;           // TXA
      case 0x98: this._A=this._Y; this._setNZ(this._A); break;           // TYA
      case 0x9a: this._SP=this._X; break;                                  // TXS
      case 0xa8: this._Y=this._A; this._setNZ(this._Y); break;           // TAY
      case 0xaa: this._X=this._A; this._setNZ(this._X); break;           // TAX
      case 0xba: this._X=this._SP; this._setNZ(this._X); break;          // TSX

      // ── LDY ────────────────────────────────────────────
      case 0xa0: this._Y=this._fetch(); this._setNZ(this._Y); break;
      case 0xa4: this._Y=this._ram.read(this._fetch()); this._setNZ(this._Y); break;
      case 0xac: this._Y=this._ram.read(this._fetchWord()); this._setNZ(this._Y); break;
      case 0xb4: this._Y=this._ram.read((this._fetch()+this._X)&0xff); this._setNZ(this._Y); break;
      case 0xbc: this._Y=this._ram.read((this._fetchWord()+this._X)&0xffff); this._setNZ(this._Y); break;

      // ── LDA ────────────────────────────────────────────
      case 0xa1: addr=(this._fetch()+this._X)&0xff; this._A=this._ram.read(this._ram.readWord(addr)); this._setNZ(this._A); break;
      case 0xa5: this._A=this._ram.read(this._fetch()); this._setNZ(this._A); break;
      case 0xa9: this._A=this._fetch(); this._setNZ(this._A); break;
      case 0xad: this._A=this._ram.read(this._fetchWord()); this._setNZ(this._A); break;
      case 0xb1: lo=this._fetch(); this._A=this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0xb5: this._A=this._ram.read((this._fetch()+this._X)&0xff); this._setNZ(this._A); break;
      case 0xb9: this._A=this._ram.read((this._fetchWord()+this._Y)&0xffff); this._setNZ(this._A); break;
      case 0xbd: this._A=this._ram.read((this._fetchWord()+this._X)&0xffff); this._setNZ(this._A); break;

      // ── LDX ────────────────────────────────────────────
      case 0xa2: this._X=this._fetch(); this._setNZ(this._X); break;
      case 0xa6: this._X=this._ram.read(this._fetch()); this._setNZ(this._X); break;
      case 0xae: this._X=this._ram.read(this._fetchWord()); this._setNZ(this._X); break;
      case 0xb6: this._X=this._ram.read((this._fetch()+this._Y)&0xff); this._setNZ(this._X); break;
      case 0xbe: this._X=this._ram.read((this._fetchWord()+this._Y)&0xffff); this._setNZ(this._X); break;

      // ── CMP ────────────────────────────────────────────
      case 0xc1: addr=(this._fetch()+this._X)&0xff; this._cmp(this._A,this._ram.read(this._ram.readWord(addr))); break;
      case 0xc5: this._cmp(this._A,this._ram.read(this._fetch())); break;
      case 0xc9: this._cmp(this._A,this._fetch()); break;
      case 0xcd: this._cmp(this._A,this._ram.read(this._fetchWord())); break;
      case 0xd1: lo=this._fetch(); this._cmp(this._A,this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff)); break;
      case 0xd5: this._cmp(this._A,this._ram.read((this._fetch()+this._X)&0xff)); break;
      case 0xd9: this._cmp(this._A,this._ram.read((this._fetchWord()+this._Y)&0xffff)); break;
      case 0xdd: this._cmp(this._A,this._ram.read((this._fetchWord()+this._X)&0xffff)); break;

      // ── CPX / CPY ──────────────────────────────────────
      case 0xe0: this._cmp(this._X,this._fetch()); break;
      case 0xe4: this._cmp(this._X,this._ram.read(this._fetch())); break;
      case 0xec: this._cmp(this._X,this._ram.read(this._fetchWord())); break;
      case 0xc0: this._cmp(this._Y,this._fetch()); break;
      case 0xc4: this._cmp(this._Y,this._ram.read(this._fetch())); break;
      case 0xcc: this._cmp(this._Y,this._ram.read(this._fetchWord())); break;

      // ── DEC ────────────────────────────────────────────
      case 0xc6: addr=this._fetch(); val=(this._ram.read(addr)-1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xd6: addr=(this._fetch()+this._X)&0xff; val=(this._ram.read(addr)-1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xce: addr=this._fetchWord(); val=(this._ram.read(addr)-1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xde: addr=(this._fetchWord()+this._X)&0xffff; val=(this._ram.read(addr)-1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;

      // ── INC ────────────────────────────────────────────
      case 0xe6: addr=this._fetch(); val=(this._ram.read(addr)+1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xf6: addr=(this._fetch()+this._X)&0xff; val=(this._ram.read(addr)+1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xee: addr=this._fetchWord(); val=(this._ram.read(addr)+1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;
      case 0xfe: addr=(this._fetchWord()+this._X)&0xffff; val=(this._ram.read(addr)+1)&0xff; this._ram.store(addr,val); this._setNZ(val); break;

      // ── INX / INY / DEX / DEY ──────────────────────────
      case 0xe8: this._X=(this._X+1)&0xff; this._setNZ(this._X); break; // INX
      case 0xc8: this._Y=(this._Y+1)&0xff; this._setNZ(this._Y); break; // INY
      case 0xca: this._X=(this._X-1)&0xff; this._setNZ(this._X); break; // DEX
      // DEY : 0x88 déjà géré dans Transfers

      // ── SBC ────────────────────────────────────────────
      case 0xe1: addr=(this._fetch()+this._X)&0xff; this._sbc(this._ram.read(this._ram.readWord(addr))); break;
      case 0xe5: this._sbc(this._ram.read(this._fetch())); break;
      case 0xe9: this._sbc(this._fetch()); break;
      case 0xed: this._sbc(this._ram.read(this._fetchWord())); break;
      case 0xf1: lo=this._fetch(); this._sbc(this._ram.read((this._ram.readWord(lo)+this._Y)&0xffff)); break;
      case 0xf5: this._sbc(this._ram.read((this._fetch()+this._X)&0xff)); break;
      case 0xf9: this._sbc(this._ram.read((this._fetchWord()+this._Y)&0xffff)); break;
      case 0xfd: this._sbc(this._ram.read((this._fetchWord()+this._X)&0xffff)); break;

      // ── NOP ────────────────────────────────────────────
      case 0xea: break;

      // ── RTS ────────────────────────────────────────────
      case 0x60: lo=this._pop(); hi=this._pop(); this._PC=((lo|(hi<<8))+1)&0xffff; break;

      // ── Opcode inconnu ─────────────────────────────────
      default: {
        const msg = `Opcode inconnu : $${op.toString(16).padStart(2,'0').toUpperCase()} à $${((this._PC-1)&0xffff).toString(16).padStart(4,'0').toUpperCase()}`;
        this._status = 'error';
        this._onError?.(msg);
        this._onHalt?.(this.getState(), 'error');
        return;
      }
    }

    // En mode debug, on s'arrête après chaque instruction
    if (this._debugMode && this._status === 'running') {
      this._status = 'paused';
      this._onHalt?.(this.getState(), 'paused');
    }
  }
}
