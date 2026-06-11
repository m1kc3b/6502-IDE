/* ─────────────────────────────────────────────────────────────
   6502 IDE — L'Archéogeek
   simulator.js

   Moteur assembleur + simulateur MOS 6502
   Basé sur 6502js de Nick Morgan / Stian Soreng (GPL v3)
   https://github.com/skilldrick/6502js

   Modernisé : ES6 modules-like, pas de jQuery, pas de DOM global,
   interface via Bus (assemble / run / stop / step / reset /
   hexdump / disassemble / goto / speed-change / debug-toggle).
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Utilitaires ─────────────────────────────────────────────── */
const num2hex = n => n.toString(16).padStart(2, '0').toUpperCase();
const addr2hex = n => n.toString(16).padStart(4, '0').toUpperCase();
const num2bin  = n => n.toString(2).padStart(8, '0');

/* ════════════════════════════════════════════════════════════════
   MEMORY  (64 Ko plat + display hook)
   ════════════════════════════════════════════════════════════════ */
const Memory = (() => {
  // 64 Ko — on ne modélise que les zones utiles
  const ram = new Uint8Array(0x10000);

  function reset() {
    ram.fill(0);
  }

  function get(addr) {
    addr &= 0xffff;
    if (addr === 0xfe) return (Math.random() * 256) | 0; // octet aléatoire
    return ram[addr];
  }

  function set(addr, val) {
    addr &= 0xffff;
    val  &= 0xff;
    ram[addr] = val;
  }

  function storeByte(addr, val) {
    addr &= 0xffff;
    val  &= 0xff;
    ram[addr] = val;
    // Zone display : $0200–$05FF
    if (addr >= 0x200 && addr <= 0x5ff) {
      Display.updatePixel(addr);
    }
  }

  function getWord(addr) {
    return get(addr) | (get(addr + 1) << 8);
  }

  /** Dump hexadécimal lisible */
  function format(start, length) {
    let out = '';
    for (let i = 0; i < length; i++) {
      if ((i & 15) === 0) {
        if (i > 0) out += '\n';
        out += `${addr2hex(start + i)}: `;
      }
      out += `${num2hex(get(start + i))} `;
    }
    return out.trimEnd();
  }

  /** Stocker la dernière touche pressée en $FF */
  function storeKeypress(e) {
    storeByte(0xff, e.which ?? e.keyCode);
  }

  return { reset, get, set, storeByte, getWord, format, storeKeypress };
})();


/* ════════════════════════════════════════════════════════════════
   DISPLAY  (canvas 32×32 — palette C64-like)
   ════════════════════════════════════════════════════════════════ */
const Display = (() => {
  const PALETTE = [
    '#000000', '#ffffff', '#880000', '#aaffee',
    '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
    '#dd8855', '#664400', '#ff7777', '#333333',
    '#777777', '#aaff66', '#0088ff', '#bbbbbb',
  ];
  const NUM_X = 32;
  const NUM_Y = 32;

  let ctx = null;
  let pixelSize = 8;

  function init(canvasEl) {
    ctx = canvasEl.getContext('2d');
    pixelSize = canvasEl.width / NUM_X;
    clear();
  }

  function clear() {
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, NUM_X * pixelSize, NUM_Y * pixelSize);
  }

  function updatePixel(addr) {
    if (!ctx) return;
    const offset = addr - 0x200;
    const x = offset % NUM_X;
    const y = Math.floor(offset / NUM_X);
    ctx.fillStyle = PALETTE[Memory.get(addr) & 0x0f];
    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
  }

  return { init, clear, updatePixel };
})();


/* ════════════════════════════════════════════════════════════════
   LABELS  (table de symboles — deux passes)
   ════════════════════════════════════════════════════════════════ */
const Labels = (() => {
  // { name: string, addr: number|null }[]
  let table = [];

  function reset() { table = []; }

  function add(name) {
    if (!find(name)) table.push({ name, addr: null });
  }

  function find(name) {
    return table.find(l => l.name === name) ?? null;
  }

  function setAddr(name, addr) {
    const l = find(name);
    if (l) l.addr = addr;
    else table.push({ name, addr });
  }

  function resolve(name) {
    const l = find(name);
    return l ? l.addr : null;
  }

  return { reset, add, find, setAddr, resolve };
})();


/* ════════════════════════════════════════════════════════════════
   ASSEMBLER  (2 passes)
   ════════════════════════════════════════════════════════════════ */
const Assembler = (() => {

  // Taille estimée d'une instruction (1re passe, avant résolution labels)
  const OPCODE_SIZES = {
    // implied / accumulator
    NOP:1, BRK:1, RTS:1, RTI:1,
    PHA:1, PLA:1, PHP:1, PLP:1,
    CLC:1, SEC:1, CLV:1, CLD:1, SED:1, CLI:1, SEI:1,
    TAX:1, TXA:1, TAY:1, TYA:1, TSX:1, TXS:1,
    DEX:1, DEY:1, INX:1, INY:1,
  };

  // Table des opcodes : [mnem][mode] → opcode
  // Modes : imm zp zpx zpy abs absx absy indx indy acc rel
  const OPCODES = {
    ADC:{ imm:0x69, zp:0x65, zpx:0x75, abs:0x6d, absx:0x7d, absy:0x79, indx:0x61, indy:0x71 },
    AND:{ imm:0x29, zp:0x25, zpx:0x35, abs:0x2d, absx:0x3d, absy:0x39, indx:0x21, indy:0x31 },
    ASL:{ acc:0x0a, zp:0x06, zpx:0x16, abs:0x0e, absx:0x1e },
    BIT:{ zp:0x24, abs:0x2c },
    CMP:{ imm:0xc9, zp:0xc5, zpx:0xd5, abs:0xcd, absx:0xdd, absy:0xd9, indx:0xc1, indy:0xd1 },
    CPX:{ imm:0xe0, zp:0xe4, abs:0xec },
    CPY:{ imm:0xc0, zp:0xc4, abs:0xcc },
    DEC:{ zp:0xc6, zpx:0xd6, abs:0xce, absx:0xde },
    EOR:{ imm:0x49, zp:0x45, zpx:0x55, abs:0x4d, absx:0x5d, absy:0x59, indx:0x41, indy:0x51 },
    INC:{ zp:0xe6, zpx:0xf6, abs:0xee, absx:0xfe },
    JMP:{ abs:0x4c, ind:0x6c },
    JSR:{ abs:0x20 },
    LDA:{ imm:0xa9, zp:0xa5, zpx:0xb5, abs:0xad, absx:0xbd, absy:0xb9, indx:0xa1, indy:0xb1 },
    LDX:{ imm:0xa2, zp:0xa6, zpy:0xb6, abs:0xae, absy:0xbe },
    LDY:{ imm:0xa0, zp:0xa4, zpx:0xb4, abs:0xac, absx:0xbc },
    LSR:{ acc:0x4a, zp:0x46, zpx:0x56, abs:0x4e, absx:0x5e },
    ORA:{ imm:0x09, zp:0x05, zpx:0x15, abs:0x0d, absx:0x1d, absy:0x19, indx:0x01, indy:0x11 },
    ROL:{ acc:0x2a, zp:0x26, zpx:0x36, abs:0x2e, absx:0x3e },
    ROR:{ acc:0x6a, zp:0x66, zpx:0x76, abs:0x6e, absx:0x7e },
    SBC:{ imm:0xe9, zp:0xe5, zpx:0xf5, abs:0xed, absx:0xfd, absy:0xf9, indx:0xe1, indy:0xf1 },
    STA:{ zp:0x85, zpx:0x95, abs:0x8d, absx:0x9d, absy:0x99, indx:0x81, indy:0x91 },
    STX:{ zp:0x86, zpy:0x96, abs:0x8e },
    STY:{ zp:0x84, zpx:0x94, abs:0x8c },
  };

  const BRANCHES = {
    BPL:0x10, BMI:0x30, BVC:0x50, BVS:0x70,
    BCC:0x90, BCS:0xb0, BNE:0xd0, BEQ:0xf0,
  };

  const IMPLIED = {
    NOP:0xea, BRK:0x00, RTS:0x60, RTI:0x40,
    PHA:0x48, PLA:0x68, PHP:0x08, PLP:0x28,
    CLC:0x18, SEC:0x38, CLV:0xb8, CLD:0xd8, SED:0xf8,
    CLI:0x58, SEI:0x78,
    TAX:0xaa, TXA:0x8a, TAY:0xa8, TYA:0x98,
    TSX:0xba, TXS:0x9a,
    DEX:0xca, DEY:0x88, INX:0xe8, INY:0xc8,
  };

  // Résolution d'une valeur littérale ou d'un label
  function resolveVal(token) {
    if (token === undefined || token === null) return null;
    token = token.trim();
    if (/^\$[0-9a-fA-F]+$/.test(token)) return parseInt(token.slice(1), 16);
    if (/^%[01]+$/.test(token))          return parseInt(token.slice(1), 2);
    if (/^\d+$/.test(token))             return parseInt(token, 10);
    if (/^'.'$/.test(token))             return token.charCodeAt(1);
    return Labels.resolve(token);
  }

  // Émettre des octets dans le buffer et mettre à jour la RAM
  function emit(buf, bytes) {
    for (const b of bytes) buf.push(b & 0xff);
  }

  // Assemble une ligne, retourne true/false + erreur éventuelle
  // pc = adresse courante de cette instruction
  function assembleLine(line, pc, buf) {
    // Supprimer commentaires
    line = line.replace(/;.*$/, '').trim();
    if (!line) return { ok: true };

    // Directive .ORG / *=  (simple support)
    let m;
    if ((m = line.match(/^(?:\*\s*=|\.org\s+)(.+)$/i))) {
      // On ne déplace pas le PC ici — l'appelant gère
      return { ok: true };
    }

    // Directive DCB / .byte / DB
    if ((m = line.match(/^(?:DCB|\.byte|DB)\s+(.+)$/i))) {
      const parts = m[1].split(',');
      for (const p of parts) {
        const v = resolveVal(p.trim());
        if (v === null) return { ok: false, err: `Valeur indéfinie : ${p.trim()}` };
        emit(buf, [v]);
      }
      return { ok: true };
    }

    // Label (peut être sur la même ligne qu'une instruction)
    if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/))) {
      Labels.setAddr(m[1], pc + buf.length);   // adresse = base + offset courant
      line = m[2].trim();
      if (!line) return { ok: true };
    }

    const parts = line.match(/^([A-Za-z]{2,4})\s*(.*)/);
    if (!parts) return { ok: false, err: `Syntaxe invalide : ${line}` };

    const mnem    = parts[1].toUpperCase();
    const operand = parts[2].replace(/;.*$/, '').trim();

    // Implied / accumulator
    if (IMPLIED[mnem] !== undefined && (!operand || operand.toUpperCase() === 'A')) {
      emit(buf, [IMPLIED[mnem]]);
      return { ok: true };
    }

    // ASL / LSR / ROL / ROR A
    if (['ASL','LSR','ROL','ROR'].includes(mnem) && (!operand || operand.toUpperCase() === 'A')) {
      emit(buf, [OPCODES[mnem].acc]);
      return { ok: true };
    }

    // Branches (relatif)
    if (BRANCHES[mnem] !== undefined) {
      const target = resolveVal(operand);
      const opcode = BRANCHES[mnem];
      if (target === null) {
        // Label non encore résolu → placeholder 0x00, sera patché en passe 2
        emit(buf, [opcode, 0x00]);
        return { ok: true, branch: true, targetName: operand, idx: buf.length - 1 };
      }
      const instrAddr = pc + buf.length; // adresse de CETTE instruction
      const offset = target - (instrAddr + 2);
      if (offset < -128 || offset > 127)
        return { ok: false, err: `Branchement hors portée vers ${operand} (offset ${offset})` };
      emit(buf, [opcode, offset & 0xff]);
      return { ok: true };
    }

    // JSR abs
    if (mnem === 'JSR') {
      const v = resolveVal(operand);
      if (v === null) { emit(buf, [0x20, 0x00, 0x00]); return { ok: true }; }
      emit(buf, [0x20, v & 0xff, (v >> 8) & 0xff]);
      return { ok: true };
    }

    // JMP — absolu ou indirect
    if (mnem === 'JMP') {
      if ((m = operand.match(/^\((.+)\)$/))) {
        const v = resolveVal(m[1]);
        if (v === null) return { ok: false, err: `JMP ind : adresse inconnue ${m[1]}` };
        emit(buf, [0x6c, v & 0xff, (v >> 8) & 0xff]);
      } else {
        const v = resolveVal(operand);
        if (v === null) { emit(buf, [0x4c, 0x00, 0x00]); return { ok: true }; }
        emit(buf, [0x4c, v & 0xff, (v >> 8) & 0xff]);
      }
      return { ok: true };
    }

    // Pas de table pour ce mnémonique
    const op = OPCODES[mnem];
    if (!op) return { ok: false, err: `Mnémonique inconnu : ${mnem}` };

    // ── Décodage du mode d'adressage ──────────────────────────

    // Immédiat  #val
    if ((m = operand.match(/^#(.+)$/))) {
      const v = resolveVal(m[1]);
      if (v === null) return { ok: false, err: `Valeur immédiate inconnue : ${m[1]}` };
      if (op.imm === undefined) return { ok: false, err: `${mnem} ne supporte pas le mode immédiat` };
      emit(buf, [op.imm, v & 0xff]);
      return { ok: true };
    }

    // Indirect indexé X  (zp,X)
    if ((m = operand.match(/^\((.+),\s*X\)$/i))) {
      const v = resolveVal(m[1]);
      if (v === null) return { ok: false, err: `Adresse inconnue : ${m[1]}` };
      if (op.indx === undefined) return { ok: false, err: `${mnem} ne supporte pas (zp,X)` };
      emit(buf, [op.indx, v & 0xff]);
      return { ok: true };
    }

    // Indirect post-indexé Y  (zp),Y
    if ((m = operand.match(/^\((.+)\),\s*Y$/i))) {
      const v = resolveVal(m[1]);
      if (v === null) return { ok: false, err: `Adresse inconnue : ${m[1]}` };
      if (op.indy === undefined) return { ok: false, err: `${mnem} ne supporte pas (zp),Y` };
      emit(buf, [op.indy, v & 0xff]);
      return { ok: true };
    }

    // Absolu / ZP indexé X  addr,X
    if ((m = operand.match(/^(.+),\s*X$/i))) {
      const v = resolveVal(m[1]);
      if (v === null) return { ok: false, err: `Adresse inconnue : ${m[1]}` };
      if (v < 0x100 && op.zpx !== undefined) { emit(buf, [op.zpx, v & 0xff]); return { ok: true }; }
      if (op.absx !== undefined) { emit(buf, [op.absx, v & 0xff, (v >> 8) & 0xff]); return { ok: true }; }
      return { ok: false, err: `${mnem} ne supporte pas addr,X` };
    }

    // Absolu / ZP indexé Y  addr,Y
    if ((m = operand.match(/^(.+),\s*Y$/i))) {
      const v = resolveVal(m[1]);
      if (v === null) return { ok: false, err: `Adresse inconnue : ${m[1]}` };
      if (v < 0x100 && op.zpy !== undefined) { emit(buf, [op.zpy, v & 0xff]); return { ok: true }; }
      if (op.absy !== undefined) { emit(buf, [op.absy, v & 0xff, (v >> 8) & 0xff]); return { ok: true }; }
      return { ok: false, err: `${mnem} ne supporte pas addr,Y` };
    }

    // Absolu ou ZP  (pas d'index)
    if (operand) {
      const v = resolveVal(operand);
      if (v === null) {
        // Label non résolu → 3 octets placeholder
        if (op.abs !== undefined) { emit(buf, [op.abs, 0x00, 0x00]); return { ok: true }; }
        return { ok: false, err: `Adresse inconnue : ${operand}` };
      }
      if (v < 0x100 && op.zp !== undefined) { emit(buf, [op.zp, v & 0xff]); return { ok: true }; }
      if (op.abs !== undefined) { emit(buf, [op.abs, v & 0xff, (v >> 8) & 0xff]); return { ok: true }; }
      return { ok: false, err: `${mnem} ne supporte pas ce mode d'adressage` };
    }

    return { ok: false, err: `Opérande manquant pour ${mnem}` };
  }

  // ── Première passe : collecte des labels ──────────────────
  function firstPass(lines) {
    Labels.reset();
    let pc = 0x600;
    for (const raw of lines) {
      let line = raw.replace(/;.*$/, '').trim();
      if (!line) continue;

      // .org / *= → met à jour le pc
      let m;
      if ((m = line.match(/^(?:\*\s*=|\.org\s+)(.+)$/i))) {
        const v = resolveVal(m[1]);
        if (v !== null) pc = v;
        continue;
      }

      // Label seul ou label + instruction
      if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/))) {
        Labels.setAddr(m[1], pc);
        line = m[2].trim();
        if (!line) continue;
      }

      // Taille estimée
      pc += estimateSize(line);
    }
  }

  function estimateSize(line) {
    line = line.replace(/;.*$/, '').trim();
    if (!line) return 0;
    const mnemMatch = line.match(/^([A-Za-z]{2,4})\s*(.*)/);
    if (!mnemMatch) return 0;
    const mnem    = mnemMatch[1].toUpperCase();
    const operand = mnemMatch[2].trim();

    if (IMPLIED[mnem] !== undefined) return 1;
    if (BRANCHES[mnem] !== undefined) return 2;
    if (!operand || operand.toUpperCase() === 'A') return 1;
    if (/^#/.test(operand))  return 2;  // immédiat
    if (/^\(/.test(operand)) return 2;  // indirect zp
    // Essayer de résoudre pour distinguer ZP/ABS
    const inner = operand.replace(/,\s*[XY]$/i, '').replace(/[()]/g, '').trim();
    const v = resolveVal(inner);
    if (v !== null && v < 0x100) return 2;  // ZP
    return 3;  // ABS par défaut
  }

  // ── Deuxième passe : génération du code ───────────────────
  function secondPass(lines) {
    const buf = [];
    const basePC = 0x600;

    for (let i = 0; i < lines.length; i++) {
      const result = assembleLine(lines[i], basePC, buf);
      if (!result.ok) {
        return { ok: false, line: i + 1, err: result.err };
      }
    }
    return { ok: true, buf };
  }

  // ── Patch des branchements forward ───────────────────────
  // (simple : on ré-exécute la 2e passe après la 1re ; les labels sont connus)

  // ── Point d'entrée public ─────────────────────────────────
  function assemble(source) {
    const lines = source.split('\n');

    // Passe 1 : labels
    firstPass(lines);

    // Passe 2 : génération
    const result = secondPass(lines);
    if (!result.ok) return result;

    // Écriture en RAM à partir de $0600
    const { buf } = result;
    for (let i = 0; i < buf.length; i++) {
      Memory.set(0x600 + i, buf[i]);
    }

    return { ok: true, bytes: buf.length, buf };
  }

  // ── Hexdump ───────────────────────────────────────────────
  function hexdump(length) {
    return Memory.format(0x600, length);
  }

  // ── Désassemblage simple ──────────────────────────────────
  function disassemble(start, length) {
    const lines = [];
    let pc = start;
    const end = start + length;

    // Table inverse opcode → { mnem, mode, size }
    const DASM = buildDasmTable();

    while (pc < end) {
      const byte = Memory.get(pc);
      const info  = DASM[byte];
      if (!info) {
        lines.push(`$${addr2hex(pc)}  ${num2hex(byte)}        ???`);
        pc++;
        continue;
      }
      const { mnem, mode, size } = info;
      let bytes = num2hex(byte);
      let arg   = '';

      if (size === 2) {
        const b1 = Memory.get(pc + 1);
        bytes += ` ${num2hex(b1)}`;
        arg = formatArg(mode, b1, null, pc);
      } else if (size === 3) {
        const b1 = Memory.get(pc + 1);
        const b2 = Memory.get(pc + 2);
        bytes += ` ${num2hex(b1)} ${num2hex(b2)}`;
        arg = formatArg(mode, b1, b2, pc);
      }

      lines.push(`$${addr2hex(pc)}  ${bytes.padEnd(8)}  ${mnem} ${arg}`.trimEnd());
      pc += size;
    }
    return lines.join('\n');
  }

  function formatArg(mode, lo, hi, pc) {
    switch (mode) {
      case 'imm':  return `#$${num2hex(lo)}`;
      case 'zp':   return `$${num2hex(lo)}`;
      case 'zpx':  return `$${num2hex(lo)},X`;
      case 'zpy':  return `$${num2hex(lo)},Y`;
      case 'abs':  return `$${addr2hex(lo | (hi << 8))}`;
      case 'absx': return `$${addr2hex(lo | (hi << 8))},X`;
      case 'absy': return `$${addr2hex(lo | (hi << 8))},Y`;
      case 'ind':  return `($${addr2hex(lo | (hi << 8))})`;
      case 'indx': return `($${num2hex(lo)},X)`;
      case 'indy': return `($${num2hex(lo)}),Y`;
      case 'rel': {
        const offset = lo > 0x7f ? lo - 0x100 : lo;
        return `$${addr2hex((pc + 2 + offset) & 0xffff)}`;
      }
      case 'acc':
      case 'imp':  return '';
      default:     return '';
    }
  }

  function buildDasmTable() {
    const t = {};
    // Implied
    for (const [mn, op] of Object.entries(IMPLIED)) t[op] = { mnem: mn, mode: 'imp', size: 1 };
    // Multi-mode
    for (const [mn, modes] of Object.entries(OPCODES)) {
      for (const [mode, op] of Object.entries(modes)) {
        const size = ['imp','acc'].includes(mode) ? 1
                   : ['zp','zpx','zpy','imm','indx','indy','rel'].includes(mode) ? 2
                   : 3;
        t[op] = { mnem: mn, mode, size };
      }
    }
    // Branches
    for (const [mn, op] of Object.entries(BRANCHES)) t[op] = { mnem: mn, mode: 'rel', size: 2 };
    return t;
  }

  return { assemble, hexdump, disassemble };
})();


/* ════════════════════════════════════════════════════════════════
   CPU  (MOS 6502 complet)
   ════════════════════════════════════════════════════════════════ */
const CPU = (() => {

  // ── Registres ────────────────────────────────────────────
  let A, X, Y, P, PC, SP;
  let running, debugMode, executeId;
  let speedMs = 0;       // délai entre instructions (ms)
  let lastCodeLength = 0;

  // ── Flags (bits du registre P) ───────────────────────────
  const F_C = 0x01;  // Carry
  const F_Z = 0x02;  // Zero
  const F_I = 0x04;  // IRQ disable
  const F_D = 0x08;  // Decimal
  const F_B = 0x10;  // Break
  const F_V = 0x40;  // Overflow
  const F_N = 0x80;  // Negative

  function flagSet(f)   { return (P & f) !== 0; }
  function setFlag(f)   { P |= f; }
  function clearFlag(f) { P &= ~f; }
  function putFlag(f, v){ v ? setFlag(f) : clearFlag(f); }

  function setNZ(val) {
    putFlag(F_Z, (val & 0xff) === 0);
    putFlag(F_N, (val & 0x80) !== 0);
  }

  // ── Stack ─────────────────────────────────────────────────
  function stackPush(v) {
    Memory.storeByte(0x100 + SP, v & 0xff);
    SP = (SP - 1) & 0xff;
  }
  function stackPop() {
    SP = (SP + 1) & 0xff;
    return Memory.get(0x100 + SP);
  }

  // ── Lecture du flux d'instructions ───────────────────────
  function fetchByte() { const b = Memory.get(PC); PC = (PC + 1) & 0xffff; return b; }
  function fetchWord() { const lo = fetchByte(); const hi = fetchByte(); return lo | (hi << 8); }

  // ── ADC ───────────────────────────────────────────────────
  function doADC(val) {
    if (flagSet(F_D)) {
      // Mode décimal BCD
      let lo = (A & 0x0f) + (val & 0x0f) + (flagSet(F_C) ? 1 : 0);
      if (lo >= 10) lo = 0x10 | ((lo + 6) & 0x0f);
      let result = (A & 0xf0) + (val & 0xf0) + lo;
      putFlag(F_V, !((A ^ val) & 0x80) && ((A ^ result) & 0x80));
      if (result >= 160) { setFlag(F_C); result += 0x60; } else clearFlag(F_C);
      setNZ(result);
      A = result & 0xff;
    } else {
      const sum = A + val + (flagSet(F_C) ? 1 : 0);
      putFlag(F_C, sum > 0xff);
      putFlag(F_V, !((A ^ val) & 0x80) && ((A ^ sum) & 0x80));
      A = sum & 0xff;
      setNZ(A);
    }
  }

  // ── SBC ───────────────────────────────────────────────────
  function doSBC(val) {
    doADC(val ^ 0xff);
  }

  // ── Branchement relatif ───────────────────────────────────
  function branch(cond) {
    const offset = fetchByte();
    if (cond) {
      const rel = offset > 0x7f ? offset - 0x100 : offset;
      PC = (PC + rel) & 0xffff;
    }
  }

  // ── Réinitialisation ──────────────────────────────────────
  function reset() {
    stop();
    A = 0; X = 0; Y = 0; P = 0x20; PC = 0x600; SP = 0xff;
    Memory.reset();
    Display.clear();
    emitRegs();
  }

  // ── Execute une instruction ───────────────────────────────
  function step() {
    const opcode = fetchByte();
    let addr, lo, hi, val, tmp;

    switch (opcode) {

      // ── BRK ─────────────────────────────────────────────
      case 0x00: running = false; break;

      // ── ORA ─────────────────────────────────────────────
      case 0x01: addr = (fetchByte() + X) & 0xff; A |= Memory.get(Memory.getWord(addr)); setNZ(A); break;
      case 0x05: A |= Memory.get(fetchByte()); setNZ(A); break;
      case 0x09: A |= fetchByte(); setNZ(A); break;
      case 0x0d: A |= Memory.get(fetchWord()); setNZ(A); break;
      case 0x11: lo = fetchByte(); A |= Memory.get((Memory.getWord(lo) + Y) & 0xffff); setNZ(A); break;
      case 0x15: A |= Memory.get((fetchByte() + X) & 0xff); setNZ(A); break;
      case 0x19: A |= Memory.get((fetchWord() + Y) & 0xffff); setNZ(A); break;
      case 0x1d: A |= Memory.get((fetchWord() + X) & 0xffff); setNZ(A); break;

      // ── ASL ─────────────────────────────────────────────
      case 0x0a: putFlag(F_C, A & 0x80); A = (A << 1) & 0xff; setNZ(A); break;
      case 0x06: addr = fetchByte(); val = Memory.get(addr); putFlag(F_C, val & 0x80); val = (val << 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x16: addr = (fetchByte() + X) & 0xff; val = Memory.get(addr); putFlag(F_C, val & 0x80); val = (val << 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x0e: addr = fetchWord(); val = Memory.get(addr); putFlag(F_C, val & 0x80); val = (val << 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x1e: addr = (fetchWord() + X) & 0xffff; val = Memory.get(addr); putFlag(F_C, val & 0x80); val = (val << 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;

      // ── PHP / PHA ────────────────────────────────────────
      case 0x08: stackPush(P | 0x30); break;
      case 0x48: stackPush(A); break;

      // ── Branches ─────────────────────────────────────────
      case 0x10: branch(!flagSet(F_N)); break;   // BPL
      case 0x30: branch( flagSet(F_N)); break;   // BMI
      case 0x50: branch(!flagSet(F_V)); break;   // BVC
      case 0x70: branch( flagSet(F_V)); break;   // BVS
      case 0x90: branch(!flagSet(F_C)); break;   // BCC
      case 0xb0: branch( flagSet(F_C)); break;   // BCS
      case 0xd0: branch(!flagSet(F_Z)); break;   // BNE
      case 0xf0: branch( flagSet(F_Z)); break;   // BEQ

      // ── CLC / SEC / CLV / CLD / SED / CLI / SEI ─────────
      case 0x18: clearFlag(F_C); break;
      case 0x38: setFlag(F_C);   break;
      case 0xb8: clearFlag(F_V); break;
      case 0xd8: clearFlag(F_D); break;
      case 0xf8: setFlag(F_D);   break;
      case 0x58: clearFlag(F_I); break;
      case 0x78: setFlag(F_I);   break;

      // ── JSR ──────────────────────────────────────────────
      case 0x20:
        addr = fetchWord();
        stackPush(((PC - 1) >> 8) & 0xff);
        stackPush((PC - 1) & 0xff);
        PC = addr;
        break;

      // ── AND ──────────────────────────────────────────────
      case 0x21: addr = (fetchByte() + X) & 0xff; A &= Memory.get(Memory.getWord(addr)); setNZ(A); break;
      case 0x25: A &= Memory.get(fetchByte()); setNZ(A); break;
      case 0x29: A &= fetchByte(); setNZ(A); break;
      case 0x2d: A &= Memory.get(fetchWord()); setNZ(A); break;
      case 0x31: lo = fetchByte(); A &= Memory.get((Memory.getWord(lo) + Y) & 0xffff); setNZ(A); break;
      case 0x35: A &= Memory.get((fetchByte() + X) & 0xff); setNZ(A); break;
      case 0x39: A &= Memory.get((fetchWord() + Y) & 0xffff); setNZ(A); break;
      case 0x3d: A &= Memory.get((fetchWord() + X) & 0xffff); setNZ(A); break;

      // ── BIT ──────────────────────────────────────────────
      case 0x24: val = Memory.get(fetchByte());  putFlag(F_N, val & 0x80); putFlag(F_V, val & 0x40); putFlag(F_Z, !(A & val)); break;
      case 0x2c: val = Memory.get(fetchWord());  putFlag(F_N, val & 0x80); putFlag(F_V, val & 0x40); putFlag(F_Z, !(A & val)); break;

      // ── ROL ──────────────────────────────────────────────
      case 0x2a: tmp = flagSet(F_C); putFlag(F_C, A & 0x80); A = ((A << 1) | tmp) & 0xff; setNZ(A); break;
      case 0x26: addr = fetchByte(); val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 0x80); val = ((val << 1) | tmp) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x36: addr = (fetchByte() + X) & 0xff; val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 0x80); val = ((val << 1) | tmp) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x2e: addr = fetchWord(); val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 0x80); val = ((val << 1) | tmp) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x3e: addr = (fetchWord() + X) & 0xffff; val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 0x80); val = ((val << 1) | tmp) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;

      // ── PLP ──────────────────────────────────────────────
      case 0x28: P = stackPop() | 0x20; break;

      // ── RTI ──────────────────────────────────────────────
      case 0x40: P = stackPop() | 0x20; lo = stackPop(); hi = stackPop(); PC = lo | (hi << 8); break;

      // ── EOR ──────────────────────────────────────────────
      case 0x41: addr = (fetchByte() + X) & 0xff; A ^= Memory.get(Memory.getWord(addr)); setNZ(A); break;
      case 0x45: A ^= Memory.get(fetchByte()); setNZ(A); break;
      case 0x49: A ^= fetchByte(); setNZ(A); break;
      case 0x4d: A ^= Memory.get(fetchWord()); setNZ(A); break;
      case 0x51: lo = fetchByte(); A ^= Memory.get((Memory.getWord(lo) + Y) & 0xffff); setNZ(A); break;
      case 0x55: A ^= Memory.get((fetchByte() + X) & 0xff); setNZ(A); break;
      case 0x59: A ^= Memory.get((fetchWord() + Y) & 0xffff); setNZ(A); break;
      case 0x5d: A ^= Memory.get((fetchWord() + X) & 0xffff); setNZ(A); break;

      // ── LSR ──────────────────────────────────────────────
      case 0x4a: putFlag(F_C, A & 1); A >>= 1; setNZ(A); break;
      case 0x46: addr = fetchByte(); val = Memory.get(addr); putFlag(F_C, val & 1); val >>= 1; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x56: addr = (fetchByte() + X) & 0xff; val = Memory.get(addr); putFlag(F_C, val & 1); val >>= 1; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x4e: addr = fetchWord(); val = Memory.get(addr); putFlag(F_C, val & 1); val >>= 1; Memory.storeByte(addr, val); setNZ(val); break;
      case 0x5e: addr = (fetchWord() + X) & 0xffff; val = Memory.get(addr); putFlag(F_C, val & 1); val >>= 1; Memory.storeByte(addr, val); setNZ(val); break;

      // ── JMP ──────────────────────────────────────────────
      case 0x4c: PC = fetchWord(); break;
      case 0x6c: addr = fetchWord(); PC = Memory.getWord(addr); break;

      // ── PLA ──────────────────────────────────────────────
      case 0x68: A = stackPop(); setNZ(A); break;

      // ── ROR ──────────────────────────────────────────────
      case 0x6a: tmp = flagSet(F_C); putFlag(F_C, A & 1); A = ((A >> 1) | (tmp ? 0x80 : 0)); setNZ(A); break;
      case 0x66: addr = fetchByte(); val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 1); val = ((val >> 1) | (tmp ? 0x80 : 0)); Memory.storeByte(addr, val); setNZ(val); break;
      case 0x76: addr = (fetchByte() + X) & 0xff; val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 1); val = ((val >> 1) | (tmp ? 0x80 : 0)); Memory.storeByte(addr, val); setNZ(val); break;
      case 0x6e: addr = fetchWord(); val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 1); val = ((val >> 1) | (tmp ? 0x80 : 0)); Memory.storeByte(addr, val); setNZ(val); break;
      case 0x7e: addr = (fetchWord() + X) & 0xffff; val = Memory.get(addr); tmp = flagSet(F_C); putFlag(F_C, val & 1); val = ((val >> 1) | (tmp ? 0x80 : 0)); Memory.storeByte(addr, val); setNZ(val); break;

      // ── ADC ──────────────────────────────────────────────
      case 0x61: addr = (fetchByte() + X) & 0xff; doADC(Memory.get(Memory.getWord(addr))); break;
      case 0x65: doADC(Memory.get(fetchByte())); break;
      case 0x69: doADC(fetchByte()); break;
      case 0x6d: doADC(Memory.get(fetchWord())); break;
      case 0x71: lo = fetchByte(); doADC(Memory.get((Memory.getWord(lo) + Y) & 0xffff)); break;
      case 0x75: doADC(Memory.get((fetchByte() + X) & 0xff)); break;
      case 0x79: doADC(Memory.get((fetchWord() + Y) & 0xffff)); break;
      case 0x7d: doADC(Memory.get((fetchWord() + X) & 0xffff)); break;

      // ── STA ──────────────────────────────────────────────
      case 0x81: addr = (fetchByte() + X) & 0xff; Memory.storeByte(Memory.getWord(addr), A); break;
      case 0x85: Memory.storeByte(fetchByte(), A); break;
      case 0x8d: Memory.storeByte(fetchWord(), A); break;
      case 0x91: lo = fetchByte(); Memory.storeByte((Memory.getWord(lo) + Y) & 0xffff, A); break;
      case 0x95: Memory.storeByte((fetchByte() + X) & 0xff, A); break;
      case 0x99: Memory.storeByte((fetchWord() + Y) & 0xffff, A); break;
      case 0x9d: Memory.storeByte((fetchWord() + X) & 0xffff, A); break;

      // ── STX ──────────────────────────────────────────────
      case 0x86: Memory.storeByte(fetchByte(), X); break;
      case 0x8e: Memory.storeByte(fetchWord(), X); break;
      case 0x96: Memory.storeByte((fetchByte() + Y) & 0xff, X); break;

      // ── STY ──────────────────────────────────────────────
      case 0x84: Memory.storeByte(fetchByte(), Y); break;
      case 0x8c: Memory.storeByte(fetchWord(), Y); break;
      case 0x94: Memory.storeByte((fetchByte() + X) & 0xff, Y); break;

      // ── Transfers ────────────────────────────────────────
      case 0x88: Y = (Y - 1) & 0xff; setNZ(Y); break;  // DEY
      case 0x8a: A = X; setNZ(A); break;                // TXA
      case 0x98: A = Y; setNZ(A); break;                // TYA
      case 0x9a: SP = X; break;                          // TXS
      case 0xa8: Y = A; setNZ(Y); break;                // TAY
      case 0xaa: X = A; setNZ(X); break;                // TAX
      case 0xba: X = SP; setNZ(X); break;               // TSX

      // ── LDY ──────────────────────────────────────────────
      case 0xa0: Y = fetchByte(); setNZ(Y); break;
      case 0xa4: Y = Memory.get(fetchByte()); setNZ(Y); break;
      case 0xac: Y = Memory.get(fetchWord()); setNZ(Y); break;
      case 0xb4: Y = Memory.get((fetchByte() + X) & 0xff); setNZ(Y); break;
      case 0xbc: Y = Memory.get((fetchWord() + X) & 0xffff); setNZ(Y); break;

      // ── LDA ──────────────────────────────────────────────
      case 0xa1: addr = (fetchByte() + X) & 0xff; A = Memory.get(Memory.getWord(addr)); setNZ(A); break;
      case 0xa5: A = Memory.get(fetchByte()); setNZ(A); break;
      case 0xa9: A = fetchByte(); setNZ(A); break;
      case 0xad: A = Memory.get(fetchWord()); setNZ(A); break;
      case 0xb1: lo = fetchByte(); A = Memory.get((Memory.getWord(lo) + Y) & 0xffff); setNZ(A); break;
      case 0xb5: A = Memory.get((fetchByte() + X) & 0xff); setNZ(A); break;
      case 0xb9: A = Memory.get((fetchWord() + Y) & 0xffff); setNZ(A); break;
      case 0xbd: A = Memory.get((fetchWord() + X) & 0xffff); setNZ(A); break;

      // ── LDX ──────────────────────────────────────────────
      case 0xa2: X = fetchByte(); setNZ(X); break;
      case 0xa6: X = Memory.get(fetchByte()); setNZ(X); break;
      case 0xae: X = Memory.get(fetchWord()); setNZ(X); break;
      case 0xb6: X = Memory.get((fetchByte() + Y) & 0xff); setNZ(X); break;
      case 0xbe: X = Memory.get((fetchWord() + Y) & 0xffff); setNZ(X); break;

      // ── CMP ──────────────────────────────────────────────
      case 0xc1: addr = (fetchByte() + X) & 0xff; val = Memory.get(Memory.getWord(addr)); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xc5: val = Memory.get(fetchByte()); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xc9: val = fetchByte(); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xcd: val = Memory.get(fetchWord()); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xd1: lo = fetchByte(); val = Memory.get((Memory.getWord(lo) + Y) & 0xffff); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xd5: val = Memory.get((fetchByte() + X) & 0xff); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xd9: val = Memory.get((fetchWord() + Y) & 0xffff); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;
      case 0xdd: val = Memory.get((fetchWord() + X) & 0xffff); putFlag(F_C, A >= val); setNZ((A - val) & 0xff); break;

      // ── CPX ──────────────────────────────────────────────
      case 0xe0: val = fetchByte(); putFlag(F_C, X >= val); setNZ((X - val) & 0xff); break;
      case 0xe4: val = Memory.get(fetchByte()); putFlag(F_C, X >= val); setNZ((X - val) & 0xff); break;
      case 0xec: val = Memory.get(fetchWord()); putFlag(F_C, X >= val); setNZ((X - val) & 0xff); break;

      // ── CPY ──────────────────────────────────────────────
      case 0xc0: val = fetchByte(); putFlag(F_C, Y >= val); setNZ((Y - val) & 0xff); break;
      case 0xc4: val = Memory.get(fetchByte()); putFlag(F_C, Y >= val); setNZ((Y - val) & 0xff); break;
      case 0xcc: val = Memory.get(fetchWord()); putFlag(F_C, Y >= val); setNZ((Y - val) & 0xff); break;

      // ── DEC ──────────────────────────────────────────────
      case 0xc6: addr = fetchByte(); val = (Memory.get(addr) - 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xd6: addr = (fetchByte() + X) & 0xff; val = (Memory.get(addr) - 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xce: addr = fetchWord(); val = (Memory.get(addr) - 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xde: addr = (fetchWord() + X) & 0xffff; val = (Memory.get(addr) - 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;

      // ── INC ──────────────────────────────────────────────
      case 0xe6: addr = fetchByte(); val = (Memory.get(addr) + 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xf6: addr = (fetchByte() + X) & 0xff; val = (Memory.get(addr) + 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xee: addr = fetchWord(); val = (Memory.get(addr) + 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;
      case 0xfe: addr = (fetchWord() + X) & 0xffff; val = (Memory.get(addr) + 1) & 0xff; Memory.storeByte(addr, val); setNZ(val); break;

      // ── DEX / DEY / INX / INY ────────────────────────────
      case 0xca: X = (X - 1) & 0xff; setNZ(X); break;  // DEX
      case 0xc8: Y = (Y + 1) & 0xff; setNZ(Y); break;  // INY
      case 0xe8: X = (X + 1) & 0xff; setNZ(X); break;  // INX
      case 0x88: Y = (Y - 1) & 0xff; setNZ(Y); break;  // DEY (duplicate guard)

      // ── SBC ──────────────────────────────────────────────
      case 0xe1: addr = (fetchByte() + X) & 0xff; doSBC(Memory.get(Memory.getWord(addr))); break;
      case 0xe5: doSBC(Memory.get(fetchByte())); break;
      case 0xe9: doSBC(fetchByte()); break;
      case 0xed: doSBC(Memory.get(fetchWord())); break;
      case 0xf1: lo = fetchByte(); doSBC(Memory.get((Memory.getWord(lo) + Y) & 0xffff)); break;
      case 0xf5: doSBC(Memory.get((fetchByte() + X) & 0xff)); break;
      case 0xf9: doSBC(Memory.get((fetchWord() + Y) & 0xffff)); break;
      case 0xfd: doSBC(Memory.get((fetchWord() + X) & 0xffff)); break;

      // ── NOP ──────────────────────────────────────────────
      case 0xea: break;

      // ── RTS ──────────────────────────────────────────────
      case 0x60: lo = stackPop(); hi = stackPop(); PC = ((lo | (hi << 8)) + 1) & 0xffff; break;

      // ── Opcode inconnu ───────────────────────────────────
      default:
        Bus.emit('cpu-error', { msg: `Opcode inconnu : $${num2hex(opcode)} à $${addr2hex((PC - 1) & 0xffff)}` });
        running = false;
        break;
    }
  }

  // ── Boucle d'exécution ───────────────────────────────────
  function run() {
    if (!running) return;
    step();
    emitRegs();
    if (running) {
      if (speedMs <= 1) {
        // Mode rapide : micro-batches de 100 instructions par frame
        if (running) executeId = requestAnimationFrame(runBatch);
      } else {
        executeId = setTimeout(run, speedMs);
      }
    } else {
      Bus.emit('cpu-halted');
    }
  }

  function runBatch() {
    // Exécuter un lot d'instructions sans pause
    for (let i = 0; i < 500 && running; i++) step();
    emitRegs();
    if (running) executeId = requestAnimationFrame(runBatch);
    else Bus.emit('cpu-halted');
  }

  function stop() {
    running = false;
    if (executeId) {
      clearTimeout(executeId);
      cancelAnimationFrame(executeId);
      executeId = null;
    }
  }

  function start() {
    if (running) return;
    running = true;
    if (speedMs <= 1) requestAnimationFrame(runBatch);
    else run();
  }

  function stepOnce() {
    if (running) return;
    step();
    emitRegs();
    if (!running) Bus.emit('cpu-halted');
  }

  function setSpeed(percent) {
    // 1% → ~2000 ms/instr  |  50% → ~20 ms  |  100% → 0 (max vitesse)
    if (percent >= 95) { speedMs = 0; return; }
    speedMs = Math.round(2000 / percent) - 1;
  }

  function gotoAddr(addr) {
    PC = addr & 0xffff;
    emitRegs();
  }

  // ── Émission de l'état des registres ─────────────────────
  function emitRegs() {
    Bus.emit('regs-update', { A, X, Y, P, PC, SP });
  }

  function getState() { return { A, X, Y, P, PC, SP, running, debugMode }; }

  return { reset, start, stop, stepOnce, setSpeed, gotoAddr, getState, emitRegs };
})();


/* ════════════════════════════════════════════════════════════════
   DEBUGGER UI  — mise à jour des registres dans la modale
   ════════════════════════════════════════════════════════════════ */
const DebuggerUI = (() => {
  const els = {
    a:  document.getElementById('dbg-a'),
    x:  document.getElementById('dbg-x'),
    y:  document.getElementById('dbg-y'),
    sp: document.getElementById('dbg-sp'),
    pc: document.getElementById('dbg-pc'),
    flagN: document.getElementById('flag-n'),
    flagV: document.getElementById('flag-v'),
    flagB: document.getElementById('flag-b'),
    flagD: document.getElementById('flag-d'),
    flagI: document.getElementById('flag-i'),
    flagZ: document.getElementById('flag-z'),
    flagC: document.getElementById('flag-c'),
    monitorBody: document.getElementById('monitor-body'),
    pcBar: document.getElementById('sb-pc'),
  };

  function updateRegs({ A, X, Y, P, PC, SP }) {
    if (!els.a) return;
    els.a.textContent  = `$${num2hex(A)}`;
    els.x.textContent  = `$${num2hex(X)}`;
    els.y.textContent  = `$${num2hex(Y)}`;
    els.sp.textContent = `$${num2hex(SP)}`;
    els.pc.textContent = `$${addr2hex(PC)}`;

    const flags = [
      { el: els.flagN, mask: 0x80 },
      { el: els.flagV, mask: 0x40 },
      { el: els.flagB, mask: 0x10 },
      { el: els.flagD, mask: 0x08 },
      { el: els.flagI, mask: 0x04 },
      { el: els.flagZ, mask: 0x02 },
      { el: els.flagC, mask: 0x01 },
    ];
    for (const { el, mask } of flags) {
      el.classList.toggle('set', (P & mask) !== 0);
    }

    // Status bar PC
    if (els.pcBar) els.pcBar.textContent = `$${addr2hex(PC)}`;
  }

  function updateMonitor(startAddr) {
    if (!els.monitorBody) return;
    const rows = [];
    for (let i = 0; i < 16; i++) {
      const addr = (startAddr + i) & 0xffff;
      const v    = Memory.get(addr);
      rows.push(
        `<tr>
          <td>$${addr2hex(addr)}</td>
          <td>${v}</td>
          <td>$${num2hex(v)}</td>
          <td>${num2bin(v)}</td>
        </tr>`
      );
    }
    els.monitorBody.innerHTML = rows.join('');
  }

  return { updateRegs, updateMonitor };
})();


/* ════════════════════════════════════════════════════════════════
   LIVE INDICATOR
   ════════════════════════════════════════════════════════════════ */
const LiveIndicator = (() => {
  const el = document.getElementById('live-indicator');
  function on()  { el?.classList.add('active'); }
  function off() { el?.classList.remove('active'); }
  return { on, off };
})();


/* ════════════════════════════════════════════════════════════════
   BRANCHEMENT  Bus → logique métier
   ════════════════════════════════════════════════════════════════ */
let lastCodeLength = 0;
let monitorAddr    = 0x00;     // adresse courante du moniteur mémoire

// ── Assembler ────────────────────────────────────────────────
Bus.on('assemble', () => {
  const source = Editor.getValue();
  CPU.reset();
  const result = Assembler.assemble(source);

  if (result.ok) {
    lastCodeLength = result.bytes;
    Console.log(`✓ Assemblé — ${result.bytes} octet(s) → $0600–$${addr2hex(0x600 + result.bytes - 1)}`, 'ok');
    StatusBar.set('Assemblé', 'ok');
    Toolbar.setState('assembled');
    DebuggerUI.updateRegs(CPU.getState());
    DebuggerUI.updateMonitor(0x0600);
  } else {
    Console.log(`✗ Erreur ligne ${result.line} : ${result.err}`, 'err');
    StatusBar.set(`Erreur L${result.line}`, 'error');
    Toolbar.setState('idle');
  }
});

// ── Run ──────────────────────────────────────────────────────
Bus.on('run', () => {
  Toolbar.setState('running');
  StatusBar.set('En cours…', 'running');
  LiveIndicator.on();
  Console.log('▶ Exécution démarrée à $0600', 'info');
  CPU.start();
});

// ── Stop ─────────────────────────────────────────────────────
Bus.on('stop', () => {
  CPU.stop();
  Toolbar.setState('assembled');
  StatusBar.set('Arrêté', '');
  LiveIndicator.off();
  Console.log('■ Exécution stoppée', 'info');
  DebuggerUI.updateRegs(CPU.getState());
});

// ── Step ─────────────────────────────────────────────────────
Bus.on('step', () => {
  CPU.stepOnce();
  DebuggerUI.updateRegs(CPU.getState());
  DebuggerUI.updateMonitor(monitorAddr);
  const { PC } = CPU.getState();
  Console.log(`→ Step → PC=$${addr2hex(PC)}`, 'info');
});

// ── Reset ────────────────────────────────────────────────────
Bus.on('reset', () => {
  CPU.reset();
  lastCodeLength = 0;
  LiveIndicator.off();
  Toolbar.setState('idle');
  StatusBar.set('Réinitialisé', '');
  DebuggerUI.updateRegs(CPU.getState());
  DebuggerUI.updateMonitor(0x00);
  Console.log('↺ CPU réinitialisé', 'info');
});

// ── Hexdump ──────────────────────────────────────────────────
Bus.on('hexdump', () => {
  const len = Math.max(lastCodeLength, 64);
  const dump = Assembler.hexdump(len);
  Console.log(`— Hexdump $0600 (${len} octets) —`, 'hex');
  // Dump ligne par ligne pour lisibilité
  dump.split('\n').forEach(l => Console.log(l, 'hex'));
});

// ── Désassembler ─────────────────────────────────────────────
Bus.on('disassemble', () => {
  const len = Math.max(lastCodeLength, 32);
  const asm = Assembler.disassemble(0x600, len);
  Console.log('— Désassemblage $0600 —', 'hex');
  asm.split('\n').forEach(l => Console.log(l, 'hex'));
});

// ── Debug toggle ─────────────────────────────────────────────
Bus.on('debug-toggle', ({ enabled }) => {
  if (enabled) {
    Toolbar.setState('debugging');
    Console.log('● Mode debug activé — utilisez Étape', 'info');
  } else {
    Toolbar.setState('assembled');
    Console.log('○ Mode debug désactivé', 'info');
  }
});

// ── Speed ────────────────────────────────────────────────────
Bus.on('speed-change', ({ value }) => {
  CPU.setSpeed(value);
});

// ── Goto ─────────────────────────────────────────────────────
Bus.on('goto', ({ address }) => {
  let addr;
  if (/^\$[0-9a-fA-F]+$/.test(address))  addr = parseInt(address.slice(1), 16);
  else if (/^[0-9a-fA-F]+$/.test(address)) addr = parseInt(address, 16);
  else { Console.log(`Adresse invalide : ${address}`, 'err'); return; }

  monitorAddr = addr;
  CPU.gotoAddr(addr);
  DebuggerUI.updateRegs(CPU.getState());
  DebuggerUI.updateMonitor(addr);
  Console.log(`⤷ PC → $${addr2hex(addr)}`, 'info');
});

// ── CPU halted (BRK ou opcode inconnu) ───────────────────────
Bus.on('cpu-halted', () => {
  LiveIndicator.off();
  Toolbar.setState('assembled');
  StatusBar.set('Terminé', '');
  Console.log('● Programme terminé (BRK)', 'ok');
  DebuggerUI.updateRegs(CPU.getState());
  DebuggerUI.updateMonitor(monitorAddr);
});

// ── CPU error ────────────────────────────────────────────────
Bus.on('cpu-error', ({ msg }) => {
  LiveIndicator.off();
  Toolbar.setState('assembled');
  StatusBar.set('Erreur CPU', 'error');
  Console.log(`✗ ${msg}`, 'err');
  DebuggerUI.updateRegs(CPU.getState());
});

// ── Registres mis à jour en temps réel ───────────────────────
Bus.on('regs-update', data => {
  DebuggerUI.updateRegs(data);
});

// ── Code modifié → on remet en état idle ─────────────────────
Bus.on('code-change', () => {
  Toolbar.setState('idle');
  StatusBar.set('Prêt', '');
});

/* ════════════════════════════════════════════════════════════════
   INIT — à appeler après DOMContentLoaded depuis app.js
   ════════════════════════════════════════════════════════════════ */
function initSimulator() {
  // Clavier → $FF
  document.addEventListener('keypress', e => Memory.storeKeypress(e));

  // Canvas
  const canvas = document.getElementById('screen');
  if (canvas) Display.init(canvas);

  // CPU cold reset
  CPU.reset();

  Console.log('Moteur 6502 initialisé (GPL v3 — Nick Morgan / L\'Archéogeek)', 'dim');
  Console.log('$0200–$05FF = pixels écran  |  $FE = aléatoire  |  $FF = touche', 'dim');
}
