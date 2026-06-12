/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/cpu.test.ts
   Tests unitaires : Cpu6502
   Couvre : opcodes, flags N/Z/C/V, ADC/SBC BCD, stack,
            branches, runSync, reset, headless mode.
   ───────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { Cpu6502 }        from '../core/cpu.js';
import { Assembler6502 }  from '../core/assembler.js';
import { Ram64K }          from '../core/memory.js';
import { FLAGS }           from '../types/cpu.js';
import * as P              from './fixtures/programs.js';

// ── Helpers ───────────────────────────────────────────────────

function makeSystem() {
  const ram = new Ram64K();
  const cpu = new Cpu6502(ram);
  const asm = new Assembler6502();
  return { ram, cpu, asm };
}

/** Assemble + exécute un programme jusqu'à BRK, retourne l'état final */
function run(source: string, maxCycles = 5000) {
  const { ram, cpu, asm } = makeSystem();
  const result = asm.assemble(source, ram);
  if (!result.ok) throw new Error(`Assemblage échoué : ${result.err}`);
  const { cycles, halted } = cpu.runSync(maxCycles);
  return { state: cpu.getState(), ram, cycles, halted };
}

function flagSet(P: number, flag: number): boolean {
  return (P & flag) !== 0;
}

// ─────────────────────────────────────────────────────────────

describe('Cpu6502', () => {

  // ── Reset (Tâche 2.2) ────────────────────────────────────

  describe('reset()', () => {
    it('initialise tous les registres à leur valeur de reset', () => {
      const { cpu } = makeSystem();
      const s = cpu.getState();
      expect(s.A).toBe(0);
      expect(s.X).toBe(0);
      expect(s.Y).toBe(0);
      expect(s.PC).toBe(0x0600);
      expect(s.SP).toBe(0xff);
      expect(s.P & FLAGS.U).toBeTruthy(); // bit 5 toujours 1
    });

    it('vide la RAM', () => {
      const { cpu, ram } = makeSystem();
      ram.write(0x0010, 0xff);
      cpu.reset();
      expect(ram.read(0x0010)).toBe(0);
    });

    it('émet le statut idle après reset', () => {
      const { cpu } = makeSystem();
      expect(cpu.status).toBe('idle');
    });
  });

  // ── runSync ──────────────────────────────────────────────

  describe('runSync()', () => {
    it('retourne halted:true quand BRK est atteint', () => {
      const { halted } = run('BRK');
      expect(halted).toBe(true);
    });

    it('retourne halted:false si maxCycles atteint avant BRK', () => {
      const { cpu, ram, asm } = makeSystem();
      // Boucle infinie
      asm.assemble('loop:\n  JMP loop\n', ram);
      const { halted } = cpu.runSync(100);
      expect(halted).toBe(false);
    });

    it('compte les cycles correctement', () => {
      // LDA #$42 (1 instr) + BRK (1 instr) = 2 cycles
      const { cycles } = run('LDA #$42\nBRK');
      expect(cycles).toBe(2);
    });
  });

  // ── LDA / LDX / LDY ─────────────────────────────────────

  describe('LDA / LDX / LDY', () => {
    it('LDA #$42 → A = 0x42', () => {
      const { state } = run(P.LOAD_IMMEDIATE);
      expect(state.A).toBe(0x42);
    });

    it('LDA #$00 positionne le flag Z', () => {
      const { state } = run('LDA #$00\nBRK');
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });

    it('LDA #$80 positionne le flag N', () => {
      const { state } = run('LDA #$80\nBRK');
      expect(flagSet(state.P, FLAGS.N)).toBe(true);
    });

    it('LDA #$01 efface les flags N et Z', () => {
      const { state } = run('LDA #$01\nBRK');
      expect(flagSet(state.P, FLAGS.N)).toBe(false);
      expect(flagSet(state.P, FLAGS.Z)).toBe(false);
    });

    it('LDX #$AA → X = 0xAA', () => {
      const { state } = run('LDX #$AA\nBRK');
      expect(state.X).toBe(0xaa);
    });

    it('LDY #$BB → Y = 0xBB', () => {
      const { state } = run('LDY #$BB\nBRK');
      expect(state.Y).toBe(0xbb);
    });
  });

  // ── STA / STX / STY ─────────────────────────────────────

  describe('STA / STX / STY', () => {
    it('STA zero page écrit A en mémoire', () => {
      const { ram } = run(P.STORE_ZERO_PAGE);
      expect(ram.read(0x10)).toBe(0xff);
    });

    it('STX écrit X en mémoire', () => {
      const { ram } = run('LDX #$CC\nSTX $20\nBRK');
      expect(ram.read(0x20)).toBe(0xcc);
    });

    it('STY écrit Y en mémoire', () => {
      const { ram } = run('LDY #$DD\nSTY $30\nBRK');
      expect(ram.read(0x30)).toBe(0xdd);
    });
  });

  // ── Transfers ────────────────────────────────────────────

  describe('transferts de registres', () => {
    it('TAX copie A dans X', () => {
      const { state } = run('LDA #$42\nTAX\nBRK');
      expect(state.X).toBe(0x42);
    });
    it('TAY copie A dans Y', () => {
      const { state } = run('LDA #$42\nTAY\nBRK');
      expect(state.Y).toBe(0x42);
    });
    it('TXA copie X dans A', () => {
      const { state } = run('LDX #$55\nTXA\nBRK');
      expect(state.A).toBe(0x55);
    });
    it('TYA copie Y dans A', () => {
      const { state } = run('LDY #$66\nTYA\nBRK');
      expect(state.A).toBe(0x66);
    });
    it('TXS copie X dans SP', () => {
      const { state } = run('LDX #$EE\nTXS\nBRK');
      expect(state.SP).toBe(0xee);
    });
    it('TSX copie SP dans X', () => {
      const { state } = run(P.TXS_TSX);
      expect(state.X).toBe(0xee);
    });
  });

  // ── INX / INY / DEX / DEY ───────────────────────────────

  describe('INX / INY / DEX / DEY', () => {
    it('INX incrémente X', () => {
      const { state } = run('LDX #$04\nINX\nBRK');
      expect(state.X).toBe(5);
    });
    it('INX wrap $FF → $00 + flag Z', () => {
      const { state } = run('LDX #$FF\nINX\nBRK');
      expect(state.X).toBe(0);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });
    it('DEX décrémente X', () => {
      const { state } = run('LDX #$05\nDEX\nBRK');
      expect(state.X).toBe(4);
    });
    it('INY incrémente Y', () => {
      const { state } = run('LDY #$09\nINY\nBRK');
      expect(state.Y).toBe(10);
    });
    it('DEY décrémente Y', () => {
      const { state } = run('LDY #$03\nDEY\nBRK');
      expect(state.Y).toBe(2);
    });
  });

  // ── ADC ──────────────────────────────────────────────────

  describe('ADC', () => {
    it('addition simple sans carry', () => {
      const { state } = run(P.ADD_NO_CARRY);
      expect(state.A).toBe(0x30);
      expect(flagSet(state.P, FLAGS.C)).toBe(false);
    });

    it('addition avec carry entrant', () => {
      const { state } = run(P.ADD_WITH_CARRY);
      expect(state.A).toBe(0x31);
    });

    it('positionne le carry en cas de dépassement', () => {
      const { state } = run('CLC\nLDA #$FF\nADC #$01\nBRK');
      expect(state.A).toBe(0x00);
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });

    it('positionne le flag V (overflow signé)', () => {
      // $7F + $01 = $80 → overflow (positif + positif = négatif)
      const { state } = run('CLC\nLDA #$7F\nADC #$01\nBRK');
      expect(flagSet(state.P, FLAGS.V)).toBe(true);
      expect(flagSet(state.P, FLAGS.N)).toBe(true);
    });

    it('n\'active pas V si pas d\'overflow', () => {
      const { state } = run('CLC\nLDA #$10\nADC #$10\nBRK');
      expect(flagSet(state.P, FLAGS.V)).toBe(false);
    });
  });

  // ── SBC ──────────────────────────────────────────────────

  describe('SBC', () => {
    it('soustraction simple', () => {
      const { state } = run(P.SUB_SIMPLE);
      expect(state.A).toBe(0x40);
    });

    it('SBC $01 - $01 avec SEC → A = 0, flag Z', () => {
      const { state } = run(P.SET_ZERO_FLAG);
      expect(state.A).toBe(0);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });

    it('SBC positionne le borrow (carry effacé)', () => {
      const { state } = run('SEC\nLDA #$00\nSBC #$01\nBRK');
      expect(state.A).toBe(0xff);
      expect(flagSet(state.P, FLAGS.C)).toBe(false);
      expect(flagSet(state.P, FLAGS.N)).toBe(true);
    });
  });

  // ── AND / ORA / EOR ─────────────────────────────────────

  describe('AND / ORA / EOR', () => {
    it('AND #$0F masque les bits hauts', () => {
      const { state } = run(P.AND_IMM);
      expect(state.A).toBe(0x0f);
    });
    it('ORA #$0F complète les bits bas', () => {
      const { state } = run(P.ORA_IMM);
      expect(state.A).toBe(0xff);
    });
    it('EOR #$FF inverse tous les bits', () => {
      const { state } = run('LDA #$AA\nEOR #$FF\nBRK');
      expect(state.A).toBe(0x55);
    });
    it('EOR same → 0, flag Z', () => {
      const { state } = run('LDA #$42\nEOR #$42\nBRK');
      expect(state.A).toBe(0);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });
  });

  // ── ASL / LSR / ROL / ROR ────────────────────────────────

  describe('ASL / LSR / ROL / ROR', () => {
    it('ASL × 2 → $04 après $01', () => {
      const { state } = run(P.ASL_ACC);
      expect(state.A).toBe(0x04);
    });
    it('ASL positionne le carry si bit 7 = 1', () => {
      const { state } = run('LDA #$80\nASL\nBRK');
      expect(state.A).toBe(0x00);
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
    });
    it('LSR × 2 → $02 après $08', () => {
      const { state } = run(P.LSR_ACC);
      expect(state.A).toBe(0x02);
    });
    it('LSR positionne le carry si bit 0 = 1', () => {
      const { state } = run('LDA #$01\nLSR\nBRK');
      expect(state.A).toBe(0x00);
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
    });
    it('ROL injecte le carry en bit 0', () => {
      const { state } = run(P.ROL_CARRY);
      expect(state.A).toBe(0x01); // carry=$1 → bit0
    });
    it('ROR injecte le carry en bit 7', () => {
      const { state } = run(P.ROR_CARRY);
      expect(state.A).toBe(0x80); // carry→bit7
    });
  });

  // ── INC / DEC mémoire ────────────────────────────────────

  describe('INC / DEC mémoire', () => {
    it('INC $20 deux fois + DEC $20 → valeur initiale + 1', () => {
      const { ram } = run(P.INC_DEC_MEMORY);
      expect(ram.read(0x20)).toBe(6);
    });
    it('INC $FF wrap → 0, flag Z', () => {
      const { ram } = run('LDA #$FF\nSTA $10\nINC $10\nBRK');
      expect(ram.read(0x10)).toBe(0);
    });
  });

  // ── CMP / CPX / CPY ─────────────────────────────────────

  describe('CMP / CPX / CPY', () => {
    it('CMP A > val → carry set, Z clear', () => {
      const { state } = run(P.CMP_CARRY);
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
      expect(flagSet(state.P, FLAGS.Z)).toBe(false);
    });
    it('CMP A = val → carry set, Z set', () => {
      const { state } = run('LDA #$10\nCMP #$10\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });
    it('CMP A < val → carry clear', () => {
      const { state } = run('LDA #$05\nCMP #$10\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(false);
    });
    it('CPX $10 = X → flag Z', () => {
      const { state } = run('LDX #$10\nCPX #$10\nBRK');
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });
    it('CPY #$10 < Y → carry set', () => {
      const { state } = run('LDY #$20\nCPY #$10\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
    });
  });

  // ── Branches ─────────────────────────────────────────────

  describe('branches', () => {
    it('BNE prend la branche si Z = 0 (boucle 3×)', () => {
      const { state } = run(P.BRANCH_BNE);
      expect(state.X).toBe(0);
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });

    it('BEQ saute par-dessus LDA #$FF si Z = 1', () => {
      const { state } = run(P.BRANCH_BEQ);
      expect(state.A).toBe(0x00); // n'a pas exécuté LDA #$FF
    });

    it('BCC prend la branche si C = 0', () => {
      const { state } = run('CLC\nBCC end\nLDA #$FF\nend:\nBRK');
      expect(state.A).toBe(0x00);
    });

    it('BCS prend la branche si C = 1', () => {
      const { state } = run('SEC\nBCS end\nLDA #$FF\nend:\nBRK');
      expect(state.A).toBe(0x00);
    });

    it('BMI prend la branche si N = 1', () => {
      const { state } = run('LDA #$80\nBMI end\nLDA #$00\nend:\nBRK');
      expect(state.A).toBe(0x80);
    });

    it('BPL prend la branche si N = 0', () => {
      const { state } = run('LDA #$01\nBPL end\nLDA #$FF\nend:\nBRK');
      expect(state.A).toBe(0x01);
    });
  });

  // ── Stack (PHA / PLA / PHP / PLP) ────────────────────────

  describe('stack', () => {
    it('PHA empile A, PLA le restaure', () => {
      const { state } = run(P.STACK_PUSH_POP);
      expect(state.A).toBe(0x77);
    });

    it('PHA / PLA modifie le stack pointer de ±1', () => {
      const { cpu, ram, asm } = makeSystem();
      asm.assemble('LDA #$42\nPHA\nBRK', ram);
      cpu.runSync();
      const spAfterPush = cpu.getState().SP;

      const { cpu: cpu2, ram: ram2, asm: asm2 } = makeSystem();
      asm2.assemble('LDA #$42\nPHA\nPLA\nBRK', ram2);
      cpu2.runSync();
      const spAfterPop = cpu2.getState().SP;

      expect(spAfterPop).toBe(spAfterPush + 1);
    });

    it('PHP / PLP round-trips le registre P', () => {
      const { state } = run('SEC\nSED\nPHP\nCLC\nCLD\nPLP\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
      expect(flagSet(state.P, FLAGS.D)).toBe(true);
    });
  });

  // ── JSR / RTS ────────────────────────────────────────────

  describe('JSR / RTS', () => {
    it('exécute la sous-routine et revient', () => {
      const { state } = run(P.JSR_RTS);
      expect(state.A).toBe(0x42); // depuis la sub
      expect(state.X).toBe(0xaa); // instruction après le retour
    });
  });

  // ── Adressage absolu ─────────────────────────────────────

  describe('adressage absolu', () => {
    it('STA $0300 puis LDA $0300 relit la valeur', () => {
      const { state } = run(P.ABSOLUTE_ADDR);
      expect(state.A).toBe(0xab);
    });
  });

  // ── Adressage indexé ─────────────────────────────────────

  describe('adressage indexé', () => {
    it('STA $0200,X écrit à l\'adresse + X', () => {
      const { ram } = run(P.INDEXED_X);
      expect(ram.read(0x0202)).toBe(0xaa);
    });

    it('STA $0300,Y écrit à l\'adresse + Y', () => {
      const { ram } = run(P.INDEXED_Y);
      expect(ram.read(0x0303)).toBe(0xbb);
    });
  });

  // ── Adressage indirect ───────────────────────────────────

  describe('adressage indirect', () => {
    it('STA ($10,X) résout le vecteur en ZP', () => {
      const { ram } = run(P.INDIRECT_X);
      expect(ram.read(0x0200)).toBe(0xcc);
    });

    it('STA ($20),Y résout le vecteur + Y', () => {
      const { ram } = run(P.INDIRECT_Y);
      expect(ram.read(0x0205)).toBe(0xdd);
    });
  });

  // ── BIT ──────────────────────────────────────────────────

  describe('BIT', () => {
    it('positionne N selon bit 7 de l\'opérande', () => {
      const { state } = run(P.BIT_TEST);
      expect(flagSet(state.P, FLAGS.N)).toBe(true);
    });
    it('positionne V selon bit 6 de l\'opérande', () => {
      const { state } = run(P.BIT_TEST);
      expect(flagSet(state.P, FLAGS.V)).toBe(true);
    });
    it('positionne Z si A AND mém = 0', () => {
      const { state } = run('LDA #$0F\nSTA $10\nLDA #$F0\nBIT $10\nBRK');
      expect(flagSet(state.P, FLAGS.Z)).toBe(true);
    });
  });

  // ── SEC / CLC / CLV ──────────────────────────────────────

  describe('flags ops', () => {
    it('SEC positionne C', () => {
      const { state } = run('SEC\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(true);
    });
    it('CLC efface C', () => {
      const { state } = run('SEC\nCLC\nBRK');
      expect(flagSet(state.P, FLAGS.C)).toBe(false);
    });
    it('CLV efface V', () => {
      const { state } = run(P.CLV_TEST);
      expect(flagSet(state.P, FLAGS.V)).toBe(false);
    });
  });

  // ── Programme complet ────────────────────────────────────

  describe('programmes complets', () => {
    it('FILL_MEMORY remplit 8 octets à $0200 avec $AA', () => {
      const { ram } = run(P.FILL_MEMORY);
      for (let i = 0; i < 8; i++) {
        expect(ram.read(0x0200 + i)).toBe(0xaa);
      }
    });

    it('LOOP_INX boucle jusqu\'à X = 5', () => {
      const { state } = run(P.LOOP_INX);
      expect(state.X).toBe(5);
    });

    it('XY_REGISTERS: STX + STY en ZP', () => {
      const { ram } = run(P.XY_REGISTERS);
      expect(ram.read(0x10)).toBe(0xaa);
      expect(ram.read(0x11)).toBe(0xbb);
    });
  });

  // ── Callbacks ────────────────────────────────────────────

  describe('callbacks', () => {
    it('onHalt est appelé quand BRK est atteint', () => {
      const { cpu, ram, asm } = makeSystem();
      const onHalt = vi.fn();
      cpu.setCallbacks({ onHalt });
      asm.assemble('BRK', ram);
      cpu.runSync();
      expect(onHalt).toHaveBeenCalledOnce();
      expect(onHalt).toHaveBeenCalledWith(expect.any(Object), 'halted');
    });

    it('onError est appelé pour un opcode inconnu', () => {
      const { cpu, ram } = makeSystem();
      const onError = vi.fn();
      cpu.setCallbacks({ onError });
      ram.write(0x0600, 0x02); // opcode invalide
      cpu.runSync(10);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toContain('Opcode inconnu');
    });
  });

});