/* ─────────────────────────────────────────────────────────────
   Chuck IDE — core/assembler.ts
   Tâche 2.1 — Assembler6502

   Assembleur MOS 6502 deux passes, TypeScript pur.
   Basé sur easy6502 (Nick Morgan / Stian Soreng, GPL v3),
   réécrit et typé pour Chuck IDE.

   Modes d'adressage supportés :
     implied, accumulator, immediate, zero-page, zero-page X/Y,
     absolute, absolute X/Y, (indirect,X), (indirect),Y,
     relative (branches), indirect (JMP uniquement)
   Directives : .org / *= , .byte / DCB / DB
   ───────────────────────────────────────────────────────────── */

import type { Ram64K } from './memory.js';
import type { AssembleResult } from '../types/cpu.js';

// ── Helpers ──────────────────────────────────────────────────
const num2hex  = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const addr2hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();

// ── Table des opcodes ─────────────────────────────────────────
// [mnem][mode] → opcode byte
type OpcodeMode =
  | 'imp' | 'acc' | 'imm'
  | 'zp'  | 'zpx' | 'zpy'
  | 'abs' | 'absx'| 'absy'
  | 'indx'| 'indy'| 'ind'
  | 'rel';

type OpcodeTable = Partial<Record<OpcodeMode, number>>;

const IMPLIED: Record<string, number> = {
  NOP: 0xea, BRK: 0x00, RTS: 0x60, RTI: 0x40,
  PHA: 0x48, PLA: 0x68, PHP: 0x08, PLP: 0x28,
  CLC: 0x18, SEC: 0x38, CLV: 0xb8, CLD: 0xd8, SED: 0xf8,
  CLI: 0x58, SEI: 0x78,
  TAX: 0xaa, TXA: 0x8a, TAY: 0xa8, TYA: 0x98,
  TSX: 0xba, TXS: 0x9a,
  DEX: 0xca, DEY: 0x88, INX: 0xe8, INY: 0xc8,
};

const BRANCHES: Record<string, number> = {
  BPL: 0x10, BMI: 0x30, BVC: 0x50, BVS: 0x70,
  BCC: 0x90, BCS: 0xb0, BNE: 0xd0, BEQ: 0xf0,
};

const OPCODES: Record<string, OpcodeTable> = {
  ADC: { imm:0x69, zp:0x65, zpx:0x75, abs:0x6d, absx:0x7d, absy:0x79, indx:0x61, indy:0x71 },
  AND: { imm:0x29, zp:0x25, zpx:0x35, abs:0x2d, absx:0x3d, absy:0x39, indx:0x21, indy:0x31 },
  ASL: { acc:0x0a, zp:0x06, zpx:0x16, abs:0x0e, absx:0x1e },
  BIT: { zp:0x24, abs:0x2c },
  CMP: { imm:0xc9, zp:0xc5, zpx:0xd5, abs:0xcd, absx:0xdd, absy:0xd9, indx:0xc1, indy:0xd1 },
  CPX: { imm:0xe0, zp:0xe4, abs:0xec },
  CPY: { imm:0xc0, zp:0xc4, abs:0xcc },
  DEC: { zp:0xc6, zpx:0xd6, abs:0xce, absx:0xde },
  EOR: { imm:0x49, zp:0x45, zpx:0x55, abs:0x4d, absx:0x5d, absy:0x59, indx:0x41, indy:0x51 },
  INC: { zp:0xe6, zpx:0xf6, abs:0xee, absx:0xfe },
  JMP: { abs:0x4c, ind:0x6c },
  JSR: { abs:0x20 },
  LDA: { imm:0xa9, zp:0xa5, zpx:0xb5, abs:0xad, absx:0xbd, absy:0xb9, indx:0xa1, indy:0xb1 },
  LDX: { imm:0xa2, zp:0xa6, zpy:0xb6, abs:0xae, absy:0xbe },
  LDY: { imm:0xa0, zp:0xa4, zpx:0xb4, abs:0xac, absx:0xbc },
  LSR: { acc:0x4a, zp:0x46, zpx:0x56, abs:0x4e, absx:0x5e },
  ORA: { imm:0x09, zp:0x05, zpx:0x15, abs:0x0d, absx:0x1d, absy:0x19, indx:0x01, indy:0x11 },
  ROL: { acc:0x2a, zp:0x26, zpx:0x36, abs:0x2e, absx:0x3e },
  ROR: { acc:0x6a, zp:0x66, zpx:0x76, abs:0x6e, absx:0x7e },
  SBC: { imm:0xe9, zp:0xe5, zpx:0xf5, abs:0xed, absx:0xfd, absy:0xf9, indx:0xe1, indy:0xf1 },
  STA: { zp:0x85, zpx:0x95, abs:0x8d, absx:0x9d, absy:0x99, indx:0x81, indy:0x91 },
  STX: { zp:0x86, zpy:0x96, abs:0x8e },
  STY: { zp:0x84, zpx:0x94, abs:0x8c },
};

// ── Table de désassemblage (inverse) ─────────────────────────
interface DasmEntry { mnem: string; mode: OpcodeMode; size: 1 | 2 | 3 }

function buildDasmTable(): Record<number, DasmEntry> {
  const t: Record<number, DasmEntry> = {};
  const sizeOf = (m: OpcodeMode): 1 | 2 | 3 =>
    m === 'imp' || m === 'acc'                                    ? 1
    : m === 'zp'||m==='zpx'||m==='zpy'||m==='imm'||m==='indx'
      ||m==='indy'||m==='rel'                                     ? 2
    : 3;

  for (const [mn, op] of Object.entries(IMPLIED))
    t[op] = { mnem: mn, mode: 'imp', size: 1 };
  for (const [mn, op] of Object.entries(BRANCHES))
    t[op] = { mnem: mn, mode: 'rel', size: 2 };
  for (const [mn, modes] of Object.entries(OPCODES))
    for (const [mode, op] of Object.entries(modes) as [OpcodeMode, number][])
      t[op] = { mnem: mn, mode, size: sizeOf(mode) };
  return t;
}

const DASM_TABLE = buildDasmTable();

// ── Classe principale ─────────────────────────────────────────
export class Assembler6502 {
  private _labels = new Map<string, number>();
  private _buf:    number[] = [];
  private _basePC = 0x0600;

  // ── Point d'entrée public ──────────────────────────────────
  assemble(source: string, ram: Ram64K): AssembleResult {
    this._labels.clear();
    this._buf    = [];
    this._basePC = 0x0600;

    const lines = source.split('\n');

    // Passe 1 — collecte des labels
    this._firstPass(lines);

    // Passe 2 — génération
    const err = this._secondPass(lines);
    if (err) return err;

    // Chargement en RAM
    ram.loadBytes(this._basePC, this._buf);

    return { ok: true, bytes: this._buf.length, buf: [...this._buf] };
  }

  // ── Désassemblage d'une seule instruction au PC donné ──────
  // Retourne une chaîne lisible ex: "LDA #$42" ou "BNE $060A"
  disassembleOne(ram: Ram64K, pc: number): string {
    const byte  = ram.read(pc);
    const entry = DASM_TABLE[byte];
    if (!entry) return `??? ($${num2hex(byte)})`;

    const { mnem, mode, size } = entry;
    let argStr = '';
    if (size >= 2) {
      const b1 = ram.read(pc + 1);
      argStr = size === 3
        ? this._fmtArg(mode, b1, ram.read(pc + 2), pc)
        : this._fmtArg(mode, b1, null, pc);
    }
    return `${mnem}${argStr ? ' ' + argStr : ''}`;
  }

  // ── Désassemblage ──────────────────────────────────────────
  disassemble(ram: Ram64K, start: number, length: number): string {
    const lines: string[] = [];
    let pc = start;
    const end = start + length;

    while (pc < end) {
      const byte  = ram.read(pc);
      const entry = DASM_TABLE[byte];
      if (!entry) {
        lines.push(`$${addr2hex(pc)}  ${num2hex(byte)}           ???`);
        pc++;
        continue;
      }
      const { mnem, mode, size } = entry;
      let   bytesStr = num2hex(byte);
      let   argStr   = '';

      if (size >= 2) {
        const b1 = ram.read(pc + 1);
        bytesStr += ` ${num2hex(b1)}`;
        if (size === 3) {
          const b2 = ram.read(pc + 2);
          bytesStr += ` ${num2hex(b2)}`;
          argStr = this._fmtArg(mode, b1, b2, pc);
        } else {
          argStr = this._fmtArg(mode, b1, null, pc);
        }
      }
      lines.push(`$${addr2hex(pc)}  ${bytesStr.padEnd(9)}  ${mnem} ${argStr}`.trimEnd());
      pc += size;
    }
    return lines.join('\n');
  }

  // ── Première passe : positions des labels ──────────────────
  private _firstPass(lines: string[]): void {
    let pc = this._basePC;
    for (const raw of lines) {
      let line = raw.replace(/;.*$/, '').trim();
      if (!line) continue;

      // .org / *=
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(?:\*\s*=|\.org\s+)(.+)$/i))) {
        const v = this._resolveVal(m[1]!);
        if (v !== null) { this._basePC = v; pc = v; }
        continue;
      }
      // Label
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/))) {
        this._labels.set(m[1]!, pc);
        line = m[2]!.trim();
        if (!line) continue;
      }
      pc += this._estimateSize(line);
    }
  }

  // ── Deuxième passe : génération des octets ─────────────────
  private _secondPass(lines: string[]): AssembleResult | null {
    this._buf = [];
    for (let i = 0; i < lines.length; i++) {
      const err = this._assembleLine(lines[i]!, i + 1);
      if (err) return err;
    }
    return null;
  }

  // ── Assemblage d'une ligne ─────────────────────────────────
  private _assembleLine(raw: string, lineNum: number): AssembleResult | null {
    let line = raw.replace(/;.*$/, '').trim();
    if (!line) return null;

    let m: RegExpMatchArray | null;

    // .org / *= (ignoré en passe 2, déjà traité)
    if (/^(?:\*\s*=|\.org\s+)/i.test(line)) return null;

    // Directives .byte / DCB / DB
    if ((m = line.match(/^(?:\.byte|DCB|DB)\s+(.+)$/i))) {
      for (const part of m[1]!.split(',')) {
        const v = this._resolveVal(part.trim());
        if (v === null) return this._err(lineNum, `Valeur indéfinie : ${part.trim()}`);
        this._emit(v & 0xff);
      }
      return null;
    }

    // Label inline
    if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/))) {
      line = m[2]!.trim();
      if (!line) return null;
    }

    // Mnémonique
    const parts = line.match(/^([A-Za-z]{2,4})\s*(.*)/);
    if (!parts) return this._err(lineNum, `Syntaxe invalide : ${line}`);
    const mnem    = parts[1]!.toUpperCase();
    const operand = parts[2]!.replace(/;.*$/, '').trim();

    // Implied / accumulator
    if (IMPLIED[mnem] !== undefined && (!operand || operand.toUpperCase() === 'A')) {
      this._emit(IMPLIED[mnem]!);
      return null;
    }
    if (['ASL','LSR','ROL','ROR'].includes(mnem) && (!operand || operand.toUpperCase() === 'A')) {
      const op = OPCODES[mnem]?.acc;
      if (op === undefined) return this._err(lineNum, `${mnem} ne supporte pas l'accumulateur`);
      this._emit(op);
      return null;
    }

    // Branches relatives
    if (BRANCHES[mnem] !== undefined) {
      const opcode  = BRANCHES[mnem]!;
      const target  = this._resolveVal(operand);
      const instrPC = this._basePC + this._buf.length;
      if (target === null) {
        // Label inconnu → placeholder, sera corrigé après (forward ref non supporté ici)
        this._emit(opcode, 0x00);
        return null;
      }
      const offset = target - (instrPC + 2);
      if (offset < -128 || offset > 127)
        return this._err(lineNum, `Branchement hors portée vers ${operand} (offset ${offset})`);
      this._emit(opcode, offset & 0xff);
      return null;
    }

    // JSR
    if (mnem === 'JSR') {
      const v = this._resolveVal(operand);
      if (v === null) { this._emit(0x20, 0x00, 0x00); return null; }
      this._emit(0x20, v & 0xff, (v >> 8) & 0xff);
      return null;
    }

    // JMP
    if (mnem === 'JMP') {
      if ((m = operand.match(/^\((.+)\)$/))) {
        const v = this._resolveVal(m[1]!);
        if (v === null) return this._err(lineNum, `JMP indirect : adresse inconnue`);
        this._emit(0x6c, v & 0xff, (v >> 8) & 0xff);
      } else {
        const v = this._resolveVal(operand);
        if (v === null) { this._emit(0x4c, 0x00, 0x00); return null; }
        this._emit(0x4c, v & 0xff, (v >> 8) & 0xff);
      }
      return null;
    }

    // Table générale
    const op = OPCODES[mnem];
    if (!op) return this._err(lineNum, `Mnémonique inconnu : ${mnem}`);

    // Immédiat  #val
    if ((m = operand.match(/^#(.+)$/))) {
      const v = this._resolveVal(m[1]!);
      if (v === null) return this._err(lineNum, `Valeur immédiate inconnue : ${m[1]}`);
      if (op.imm === undefined) return this._err(lineNum, `${mnem} ne supporte pas #imm`);
      this._emit(op.imm, v & 0xff);
      return null;
    }
    // (zp,X)
    if ((m = operand.match(/^\((.+),\s*[Xx]\)$/))) {
      const v = this._resolveVal(m[1]!);
      if (v === null) return this._err(lineNum, `Adresse inconnue : ${m[1]}`);
      if (op.indx === undefined) return this._err(lineNum, `${mnem} ne supporte pas (zp,X)`);
      this._emit(op.indx, v & 0xff);
      return null;
    }
    // (zp),Y
    if ((m = operand.match(/^\((.+)\),\s*[Yy]$/))) {
      const v = this._resolveVal(m[1]!);
      if (v === null) return this._err(lineNum, `Adresse inconnue : ${m[1]}`);
      if (op.indy === undefined) return this._err(lineNum, `${mnem} ne supporte pas (zp),Y`);
      this._emit(op.indy, v & 0xff);
      return null;
    }
    // addr,X
    if ((m = operand.match(/^(.+),\s*[Xx]$/))) {
      const v = this._resolveVal(m[1]!);
      if (v === null) return this._err(lineNum, `Adresse inconnue : ${m[1]}`);
      if (v < 0x100 && op.zpx !== undefined) { this._emit(op.zpx,  v & 0xff); return null; }
      if (op.absx !== undefined)              { this._emit(op.absx, v & 0xff, (v >> 8) & 0xff); return null; }
      return this._err(lineNum, `${mnem} ne supporte pas addr,X`);
    }
    // addr,Y
    if ((m = operand.match(/^(.+),\s*[Yy]$/))) {
      const v = this._resolveVal(m[1]!);
      if (v === null) return this._err(lineNum, `Adresse inconnue : ${m[1]}`);
      if (v < 0x100 && op.zpy !== undefined) { this._emit(op.zpy,  v & 0xff); return null; }
      if (op.absy !== undefined)             { this._emit(op.absy, v & 0xff, (v >> 8) & 0xff); return null; }
      return this._err(lineNum, `${mnem} ne supporte pas addr,Y`);
    }
    // Absolu ou ZP
    if (operand) {
      const v = this._resolveVal(operand);
      if (v === null) {
        if (op.abs !== undefined) { this._emit(op.abs, 0x00, 0x00); return null; }
        return this._err(lineNum, `Adresse inconnue : ${operand}`);
      }
      if (v < 0x100 && op.zp !== undefined) { this._emit(op.zp,  v & 0xff); return null; }
      if (op.abs !== undefined)              { this._emit(op.abs, v & 0xff, (v >> 8) & 0xff); return null; }
      return this._err(lineNum, `${mnem} ne supporte pas ce mode d'adressage`);
    }

    return this._err(lineNum, `Opérande manquant pour ${mnem}`);
  }

  // ── Résolution d'un token en valeur numérique ──────────────
  private _resolveVal(token: string): number | null {
    token = token.trim();
    if (/^\$[0-9a-fA-F]+$/.test(token)) return parseInt(token.slice(1), 16);
    if (/^%[01]+$/.test(token))          return parseInt(token.slice(1), 2);
    if (/^\d+$/.test(token))             return parseInt(token, 10);
    if (/^'.'$/.test(token))             return token.charCodeAt(1);
    return this._labels.get(token) ?? null;
  }

  // ── Estimation de taille (1re passe) ──────────────────────
  private _estimateSize(line: string): number {
    const parts = line.match(/^([A-Za-z]{2,4})\s*(.*)/);
    if (!parts) return 0;
    const mnem    = parts[1]!.toUpperCase();
    const operand = (parts[2] ?? '').trim();

    if (IMPLIED[mnem] !== undefined)  return 1;
    if (BRANCHES[mnem] !== undefined) return 2;
    if (!operand || operand.toUpperCase() === 'A') return 1;
    if (/^#/.test(operand))  return 2;
    if (/^\(/.test(operand)) return 2;
    const inner = operand.replace(/,\s*[XYxy]$/, '').replace(/[()]/g, '').trim();
    const v = this._resolveVal(inner);
    if (v !== null && v < 0x100) return 2;
    return 3;
  }

  // ── Émettre des octets ─────────────────────────────────────
  private _emit(...bytes: number[]): void {
    for (const b of bytes) this._buf.push(b & 0xff);
  }

  // ── Construire une erreur ──────────────────────────────────
  private _err(line: number, err: string): AssembleResult {
    return { ok: false, bytes: 0, buf: [], line, err };
  }

  // ── Formater un argument pour le désassembleur ─────────────
  private _fmtArg(
    mode: OpcodeMode,
    lo: number,
    hi: number | null,
    pc: number,
  ): string {
    switch (mode) {
      case 'imm':  return `#$${num2hex(lo)}`;
      case 'zp':   return `$${num2hex(lo)}`;
      case 'zpx':  return `$${num2hex(lo)},X`;
      case 'zpy':  return `$${num2hex(lo)},Y`;
      case 'abs':  return `$${addr2hex(lo | ((hi ?? 0) << 8))}`;
      case 'absx': return `$${addr2hex(lo | ((hi ?? 0) << 8))},X`;
      case 'absy': return `$${addr2hex(lo | ((hi ?? 0) << 8))},Y`;
      case 'ind':  return `($${addr2hex(lo | ((hi ?? 0) << 8))})`;
      case 'indx': return `($${num2hex(lo)},X)`;
      case 'indy': return `($${num2hex(lo)}),Y`;
      case 'rel': {
        const off = lo > 0x7f ? lo - 0x100 : lo;
        return `$${addr2hex((pc + 2 + off) & 0xffff)}`;
      }
      default: return '';
    }
  }
}