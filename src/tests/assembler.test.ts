/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/assembler.test.ts
   Tests unitaires : Assembler6502
   Couvre : tous les modes d'adressage, labels, directives,
            erreurs, désassemblage.
   ───────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Assembler6502 } from '../core/assembler.js';
import { Ram64K }         from '../core/memory.js';
import * as P             from './fixtures/programs.js';

// ── Helpers ───────────────────────────────────────────────────

function assemble(source: string) {
  const ram  = new Ram64K();
  const asm  = new Assembler6502();
  const result = asm.assemble(source, ram);
  return { result, ram, asm };
}

function bytes(source: string): number[] {
  const { result } = assemble(source);
  expect(result.ok).toBe(true);
  return result.buf;
}


// ─────────────────────────────────────────────────────────────

describe('Assembler6502', () => {

  // ── Résultat d'assemblage ───────────────────────────────

  describe('résultat', () => {
    it('retourne ok:true pour un programme valide', () => {
      const { result } = assemble(P.LOAD_IMMEDIATE);
      expect(result.ok).toBe(true);
    });

    it('retourne le bon nombre d\'octets', () => {
      // LDA #$42 (2) + BRK (1) = 3
      const { result } = assemble(P.LOAD_IMMEDIATE);
      expect(result.bytes).toBe(3);
    });

    it('charge les octets en RAM à partir de $0600', () => {
      const { ram } = assemble(P.LOAD_IMMEDIATE);
      expect(ram.read(0x0600)).toBe(0xa9); // LDA #
      expect(ram.read(0x0601)).toBe(0x42); // $42
      expect(ram.read(0x0602)).toBe(0x00); // BRK
    });
  });

  // ── Implied / accumulator ───────────────────────────────

  describe('implied & accumulator', () => {
    it('NOP → $EA',  () => expect(bytes('NOP\nBRK')[0]).toBe(0xea));
    it('BRK → $00',  () => expect(bytes('BRK')[0]).toBe(0x00));
    it('RTS → $60',  () => expect(bytes('RTS')[0]).toBe(0x60));
    it('TAX → $AA',  () => expect(bytes('TAX\nBRK')[0]).toBe(0xaa));
    it('TAY → $A8',  () => expect(bytes('TAY\nBRK')[0]).toBe(0xa8));
    it('TXA → $8A',  () => expect(bytes('TXA\nBRK')[0]).toBe(0x8a));
    it('TYA → $98',  () => expect(bytes('TYA\nBRK')[0]).toBe(0x98));
    it('CLC → $18',  () => expect(bytes('CLC\nBRK')[0]).toBe(0x18));
    it('SEC → $38',  () => expect(bytes('SEC\nBRK')[0]).toBe(0x38));
    it('INX → $E8',  () => expect(bytes('INX\nBRK')[0]).toBe(0xe8));
    it('INY → $C8',  () => expect(bytes('INY\nBRK')[0]).toBe(0xc8));
    it('DEX → $CA',  () => expect(bytes('DEX\nBRK')[0]).toBe(0xca));
    it('DEY → $88',  () => expect(bytes('DEY\nBRK')[0]).toBe(0x88));
    it('ASL A → $0A',() => expect(bytes('ASL\nBRK')[0]).toBe(0x0a));
    it('LSR A → $4A',() => expect(bytes('LSR\nBRK')[0]).toBe(0x4a));
    it('ROL A → $2A',() => expect(bytes('ROL\nBRK')[0]).toBe(0x2a));
    it('ROR A → $6A',() => expect(bytes('ROR\nBRK')[0]).toBe(0x6a));
    it('PHA → $48',  () => expect(bytes('PHA\nBRK')[0]).toBe(0x48));
    it('PLA → $68',  () => expect(bytes('PLA\nBRK')[0]).toBe(0x68));
  });

  // ── Mode immédiat (#val) ────────────────────────────────

  describe('mode immédiat', () => {
    it('LDA #$42 → A9 42', () => {
      const b = bytes('LDA #$42\nBRK');
      expect(b[0]).toBe(0xa9);
      expect(b[1]).toBe(0x42);
    });
    it('LDX #$10 → A2 10', () => {
      const b = bytes('LDX #$10\nBRK');
      expect(b[0]).toBe(0xa2);
      expect(b[1]).toBe(0x10);
    });
    it('LDY #$FF → A0 FF', () => {
      const b = bytes('LDY #$FF\nBRK');
      expect(b[0]).toBe(0xa0);
      expect(b[1]).toBe(0xff);
    });
    it('ADC #$01 → 69 01', () => {
      const b = bytes('ADC #$01\nBRK');
      expect(b[0]).toBe(0x69);
    });
    it('CMP #$00 → C9 00', () => {
      expect(bytes('CMP #$00\nBRK')[0]).toBe(0xc9);
    });
    it('AND #$0F → 29 0F', () => {
      expect(bytes('AND #$0F\nBRK')[0]).toBe(0x29);
    });
    it('ORA #$F0 → 09 F0', () => {
      expect(bytes('ORA #$F0\nBRK')[0]).toBe(0x09);
    });
    it('EOR #$FF → 49 FF', () => {
      expect(bytes('EOR #$FF\nBRK')[0]).toBe(0x49);
    });
    it('SBC #$01 → E9 01', () => {
      expect(bytes('SBC #$01\nBRK')[0]).toBe(0xe9);
    });
    it('supporte les valeurs binaires %00001111', () => {
      const b = bytes('LDA #%00001111\nBRK');
      expect(b[1]).toBe(0x0f);
    });
    it('supporte les valeurs décimales', () => {
      const b = bytes('LDA #66\nBRK');
      expect(b[1]).toBe(66);
    });
    it('supporte les char literals', () => {
      const b = bytes("LDA #'A'\nBRK");
      expect(b[1]).toBe(65);
    });
  });

  // ── Zero page ───────────────────────────────────────────

  describe('mode zero page', () => {
    it('LDA $10 → A5 10 (ZP)',  () => { const b = bytes('LDA $10\nBRK'); expect(b[0]).toBe(0xa5); expect(b[1]).toBe(0x10); });
    it('STA $20 → 85 20 (ZP)',  () => { const b = bytes('STA $20\nBRK'); expect(b[0]).toBe(0x85); expect(b[1]).toBe(0x20); });
    it('LDX $30 → A6 30 (ZP)',  () => { const b = bytes('LDX $30\nBRK'); expect(b[0]).toBe(0xa6); });
    it('INC $10 → E6 10 (ZP)',  () => { const b = bytes('INC $10\nBRK'); expect(b[0]).toBe(0xe6); });
    it('DEC $10 → C6 10 (ZP)',  () => { const b = bytes('DEC $10\nBRK'); expect(b[0]).toBe(0xc6); });
    it('LDA $100 → AD (ABS si >= $100)', () => {
      const b = bytes('LDA $100\nBRK');
      expect(b[0]).toBe(0xad); // absolu
    });
  });

  // ── Zero page indexé ────────────────────────────────────

  describe('mode ZP,X / ZP,Y', () => {
    it('LDA $10,X → B5 10', () => { expect(bytes('LDA $10,X\nBRK')[0]).toBe(0xb5); });
    it('STA $10,X → 95 10', () => { expect(bytes('STA $10,X\nBRK')[0]).toBe(0x95); });
    it('LDX $10,Y → B6 10', () => { expect(bytes('LDX $10,Y\nBRK')[0]).toBe(0xb6); });
    it('STX $10,Y → 96 10', () => { expect(bytes('STX $10,Y\nBRK')[0]).toBe(0x96); });
  });

  // ── Absolu ──────────────────────────────────────────────

  describe('mode absolu', () => {
    it('LDA $0300 → AD 00 03', () => {
      const b = bytes('LDA $0300\nBRK');
      expect(b[0]).toBe(0xad);
      expect(b[1]).toBe(0x00);
      expect(b[2]).toBe(0x03);
    });
    it('STA $0400 → 8D 00 04', () => {
      const b = bytes('STA $0400\nBRK');
      expect(b[0]).toBe(0x8d);
    });
    it('JMP $0610 → 4C 10 06', () => {
      const b = bytes('JMP $0610\nBRK');
      expect(b[0]).toBe(0x4c);
      expect(b[1]).toBe(0x10);
      expect(b[2]).toBe(0x06);
    });
  });

  // ── Absolu indexé ───────────────────────────────────────

  describe('mode abs,X / abs,Y', () => {
    it('LDA $0300,X → BD 00 03', () => { expect(bytes('LDA $0300,X\nBRK')[0]).toBe(0xbd); });
    it('LDA $0300,Y → B9 00 03', () => { expect(bytes('LDA $0300,Y\nBRK')[0]).toBe(0xb9); });
    it('STA $0300,X → 9D 00 03', () => { expect(bytes('STA $0300,X\nBRK')[0]).toBe(0x9d); });
    it('STA $0300,Y → 99 00 03', () => { expect(bytes('STA $0300,Y\nBRK')[0]).toBe(0x99); });
  });

  // ── Indirect indexé (ind,X) et post-indexé (ind),Y ─────

  describe('modes indirect', () => {
    it('LDA ($10,X) → A1 10', () => { expect(bytes('LDA ($10,X)\nBRK')[0]).toBe(0xa1); });
    it('LDA ($10),Y → B1 10', () => { expect(bytes('LDA ($10),Y\nBRK')[0]).toBe(0xb1); });
    it('STA ($10,X) → 81 10', () => { expect(bytes('STA ($10,X)\nBRK')[0]).toBe(0x81); });
    it('STA ($10),Y → 91 10', () => { expect(bytes('STA ($10),Y\nBRK')[0]).toBe(0x91); });
    it('JMP ($1234) → 6C 34 12', () => {
      const b = bytes('JMP ($1234)\nBRK');
      expect(b[0]).toBe(0x6c);
      expect(b[1]).toBe(0x34);
      expect(b[2]).toBe(0x12);
    });
  });

  // ── Branches relatives ──────────────────────────────────

  describe('branches relatives', () => {
    it('BNE avec label forward calcule le bon offset', () => {
      const b = bytes('BNE end\nNOP\nend:\nBRK');
      // BNE (2) NOP (1) BRK (1) → offset = 1
      expect(b[0]).toBe(0xd0); // BNE
      expect(b[1]).toBe(0x01); // +1
    });

    it('BEQ avec label backward calcule un offset négatif', () => {
      const b = bytes('start:\nNOP\nBEQ start\nBRK');
      expect(b[1]).toBe(0xf0); // BEQ
      // NOP(1) + BEQ(2) = 3 depuis start → offset = -3 = $FD
      expect(b[2]).toBe(0xfd);
    });

    it('tous les opcodes de branchement sont corrects', () => {
      const branches: [string, number][] = [
        ['BPL', 0x10], ['BMI', 0x30], ['BVC', 0x50], ['BVS', 0x70],
        ['BCC', 0x90], ['BCS', 0xb0], ['BNE', 0xd0], ['BEQ', 0xf0],
      ];
      for (const [mnem, opcode] of branches) {
        const b = bytes(`${mnem} end\nend:\nBRK`);
        expect(b[0]).toBe(opcode);
      }
    });
  });

  // ── JSR / RTS ───────────────────────────────────────────

  describe('JSR / RTS', () => {
    it('JSR $0610 → 20 10 06', () => {
      const b = bytes('JSR $0610\nBRK');
      expect(b[0]).toBe(0x20);
      expect(b[1]).toBe(0x10);
      expect(b[2]).toBe(0x06);
    });

    it('RTS → 60', () => {
      expect(bytes('RTS')[0]).toBe(0x60);
    });
  });

  // ── Labels ──────────────────────────────────────────────

  describe('labels', () => {
    it('résout un label forward dans une branche', () => {
      const { result } = assemble(P.LOOP_INX);
      expect(result.ok).toBe(true);
    });

    it('résout un label backward dans une branche', () => {
      const { result } = assemble(`
start:
  DEX
  BNE start
  BRK
      `);
      expect(result.ok).toBe(true);
    });

    it('résout un label dans JSR', () => {
      const { result } = assemble(P.JSR_RTS);
      expect(result.ok).toBe(true);
    });

    it('label inline (label + instruction sur la même ligne)', () => {
      const b = bytes('start: NOP\nBRK');
      expect(b[0]).toBe(0xea); // NOP
    });
  });

  // ── Directives ──────────────────────────────────────────

  describe('directives', () => {
    it('.byte émet les octets correspondants', () => {
      const b = bytes('.byte $01,$02,$03\nBRK');
      expect(b[0]).toBe(0x01);
      expect(b[1]).toBe(0x02);
      expect(b[2]).toBe(0x03);
    });

    it('DCB (alias .byte) fonctionne identiquement', () => {
      const b = bytes('DCB $AA,$BB\nBRK');
      expect(b[0]).toBe(0xaa);
      expect(b[1]).toBe(0xbb);
    });

    it('DB (alias .byte) fonctionne', () => {
      const b = bytes('DB $FF\nBRK');
      expect(b[0]).toBe(0xff);
    });
  });

  // ── Commentaires & whitespace ───────────────────────────

  describe('commentaires & whitespace', () => {
    it('ignore les commentaires ;', () => {
      const b = bytes('LDA #$42 ; charge 42\nBRK');
      expect(b[0]).toBe(0xa9);
      expect(b[1]).toBe(0x42);
    });

    it('ignore les lignes vides', () => {
      const b = bytes('\n\nLDA #$01\n\nBRK\n');
      expect(b.length).toBe(3);
    });

    it('insensible à la casse des mnémoniques', () => {
      const b = bytes('lda #$42\nbrk');
      expect(b[0]).toBe(0xa9);
    });
  });

  // ── Gestion des erreurs ──────────────────────────────────

  describe('erreurs', () => {
    it('retourne ok:false pour un mnémonique inconnu', () => {
      const { result } = assemble('XYZ #$00\nBRK');
      expect(result.ok).toBe(false);
    });

    it('fournit le numéro de ligne en erreur', () => {
      const { result } = assemble('NOP\nXYZ\nBRK');
      expect(result.ok).toBe(false);
      expect(result.line).toBe(2);
    });

    it('retourne ok:false pour un branchement hors portée', () => {
      // Générer > 127 octets entre la branche et la cible
      const padding = Array(130).fill('NOP').join('\n');
      const { result } = assemble(`BNE end\n${padding}\nend:\nBRK`);
      expect(result.ok).toBe(false);
      expect(result.err).toContain('portée');
    });

    it('fournit un message d\'erreur', () => {
      const { result } = assemble('BADOP\nBRK');
      expect(result.err).toBeTruthy();
      expect(typeof result.err).toBe('string');
    });
  });

  // ── Désassemblage ────────────────────────────────────────

  describe('disassemble()', () => {
    it('produit une ligne par instruction', () => {
      const { ram, asm } = assemble('LDA #$42\nNOP\nBRK');
      const output = asm.disassemble(ram, 0x0600, 4);
      const lines = output.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('chaque ligne commence par l\'adresse hexadécimale', () => {
      const { ram, asm } = assemble('LDA #$42\nBRK');
      const output = asm.disassemble(ram, 0x0600, 3);
      expect(output).toContain('$0600');
      expect(output).toContain('$0602');
    });

    it('affiche le mnémonique et l\'opérande', () => {
      const { ram, asm } = assemble('LDA #$42\nBRK');
      const output = asm.disassemble(ram, 0x0600, 3);
      expect(output).toContain('LDA');
      expect(output).toContain('#$42');
    });
  });

});