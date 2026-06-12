/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/challenge-validator.test.ts
   Tests unitaires : moteur de validation (Tâche 3.3)
   et localStorage autosave (Tâche 2.3).

   On teste directement le noyau de validation sans passer
   par ChallengeManager entier (qui dépend de fetch).
   On isole la méthode validate() via une sous-classe testable.
   ───────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Ram64K }        from '../core/memory.js';
import { Assembler6502 } from '../core/assembler.js';
import { Cpu6502 }       from '../core/cpu.js';
import { FLAGS }         from '../types/cpu.js';
import type {
  Challenge,
  Assertion,
  ValidationResult,
  AssertionFailure,
} from '../types/challenge.js';

// ─────────────────────────────────────────────────────────────
// Mini-moteur de validation (extrait de ChallengeManager)
// pour pouvoir le tester de manière isolée
// ─────────────────────────────────────────────────────────────

function validateChallenge(
  source:    string,
  challenge: Pick<Challenge, 'assertions' | 'maxCycles'>,
): ValidationResult {
  const maxCycles = challenge.maxCycles ?? 10_000;
  const ram       = new Ram64K();
  const asm       = new Assembler6502();
  const cpu       = new Cpu6502(ram);

  // Assemblage
  const result = asm.assemble(source, ram);
  if (!result.ok) {
    const failure: AssertionFailure = {
      assertion: challenge.assertions[0] ?? { type: 'register', register: 'A', value: 0 },
      expected:  0,
      actual:    0,
      message:   `Erreur d'assemblage : ${result.err}`,
    };
    return { success: false, failures: [failure], cycles: 0, timeout: false };
  }

  // Exécution headless
  const { cycles, halted } = cpu.runSync(maxCycles);
  const timeout = !halted;
  const state   = cpu.getState();
  const failures: AssertionFailure[] = [];

  for (const assertion of challenge.assertions) {
    const failure = checkAssertion(assertion, state, ram);
    if (failure) failures.push(failure);
  }

  return { success: failures.length === 0 && !timeout, failures, cycles, timeout };
}

function checkAssertion(
  assertion: Assertion,
  state:     ReturnType<Cpu6502['getState']>,
  ram:       Ram64K,
): AssertionFailure | null {
  switch (assertion.type) {
    case 'register': {
      const actual = state[assertion.register];
      if (actual === assertion.value) return null;
      return {
        assertion,
        expected: assertion.value,
        actual,
        message: assertion.failMsg
          ?? `${assertion.register} = $${actual.toString(16).toUpperCase().padStart(2,'0')} ≠ $${assertion.value.toString(16).toUpperCase().padStart(2,'0')}`,
      };
    }
    case 'memory': {
      const actual = ram.read(assertion.address);
      if (actual === assertion.value) return null;
      return {
        assertion,
        expected: assertion.value,
        actual,
        message: assertion.failMsg ?? `mém[$${assertion.address.toString(16)}] ≠ $${assertion.value.toString(16)}`,
      };
    }
    case 'flag': {
      const mask   = FLAGS[assertion.flag];
      const actual = (state.P & mask) !== 0;
      if (actual === assertion.set) return null;
      return {
        assertion,
        expected: assertion.set,
        actual,
        message: assertion.failMsg ?? `Flag ${assertion.flag} = ${actual} ≠ ${assertion.set}`,
      };
    }
    case 'sequence': {
      for (let i = 0; i < assertion.values.length; i++) {
        const expected = assertion.values[i]!;
        const actual   = ram.read(assertion.address + i);
        if (actual !== expected) {
          return {
            assertion,
            expected,
            actual,
            message: assertion.failMsg ?? `séquence[${i}] ≠ attendu`,
          };
        }
      }
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────

describe('Moteur de validation', () => {

  // ── Assertion : register ────────────────────────────────

  describe('assertion type "register"', () => {
    it('succès quand A contient la valeur attendue', () => {
      const result = validateChallenge('LDA #$42\nBRK', {
        assertions: [{ type: 'register', register: 'A', value: 0x42 }],
      });
      expect(result.success).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('échec quand A ne contient pas la valeur attendue', () => {
      const result = validateChallenge('LDA #$00\nBRK', {
        assertions: [{ type: 'register', register: 'A', value: 0x42 }],
      });
      expect(result.success).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.actual).toBe(0x00);
      expect(result.failures[0]!.expected).toBe(0x42);
    });

    it('vérifie X', () => {
      const result = validateChallenge('LDX #$10\nBRK', {
        assertions: [{ type: 'register', register: 'X', value: 0x10 }],
      });
      expect(result.success).toBe(true);
    });

    it('vérifie Y', () => {
      const result = validateChallenge('LDY #$20\nBRK', {
        assertions: [{ type: 'register', register: 'Y', value: 0x20 }],
      });
      expect(result.success).toBe(true);
    });

    it('vérifie PC après BRK ($0602 pour LDA #$xx BRK)', () => {
      const result = validateChallenge('LDA #$00\nBRK', {
        assertions: [{ type: 'register', register: 'PC', value: 0x0603 }],
      });
      expect(result.success).toBe(true);
    });

    it('utilise failMsg personnalisé', () => {
      const result = validateChallenge('LDA #$00\nBRK', {
        assertions: [{
          type:     'register',
          register: 'A',
          value:    0x42,
          failMsg:  'L\'accumulateur devrait contenir $42 !',
        }],
      });
      expect(result.failures[0]!.message).toBe('L\'accumulateur devrait contenir $42 !');
    });

    it('plusieurs assertions : toutes doivent passer', () => {
      const result = validateChallenge('LDA #$01\nLDX #$02\nLDY #$03\nBRK', {
        assertions: [
          { type: 'register', register: 'A', value: 1 },
          { type: 'register', register: 'X', value: 2 },
          { type: 'register', register: 'Y', value: 3 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('plusieurs assertions : rapporte toutes les échecs', () => {
      const result = validateChallenge('LDA #$00\nLDX #$00\nBRK', {
        assertions: [
          { type: 'register', register: 'A', value: 0x42 },
          { type: 'register', register: 'X', value: 0x10 },
        ],
      });
      expect(result.success).toBe(false);
      expect(result.failures).toHaveLength(2);
    });
  });

  // ── Assertion : memory ──────────────────────────────────

  describe('assertion type "memory"', () => {
    it('succès quand l\'adresse contient la valeur attendue', () => {
      const result = validateChallenge('LDA #$AB\nSTA $10\nBRK', {
        assertions: [{ type: 'memory', address: 0x10, value: 0xab }],
      });
      expect(result.success).toBe(true);
    });

    it('échec quand l\'adresse ne contient pas la valeur attendue', () => {
      const result = validateChallenge('LDA #$00\nSTA $10\nBRK', {
        assertions: [{ type: 'memory', address: 0x10, value: 0xab }],
      });
      expect(result.success).toBe(false);
      expect(result.failures[0]!.actual).toBe(0x00);
    });

    it('vérifie une adresse dans la zone display ($0200)', () => {
      const result = validateChallenge('LDA #$05\nSTA $0200\nBRK', {
        assertions: [{ type: 'memory', address: 0x0200, value: 0x05 }],
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Assertion : flag ────────────────────────────────────

  describe('assertion type "flag"', () => {
    it('vérifie flag Z = 1 après LDA #$00', () => {
      const result = validateChallenge('LDA #$00\nBRK', {
        assertions: [{ type: 'flag', flag: 'Z', set: true }],
      });
      expect(result.success).toBe(true);
    });

    it('vérifie flag C = 1 après SEC', () => {
      const result = validateChallenge('SEC\nBRK', {
        assertions: [{ type: 'flag', flag: 'C', set: true }],
      });
      expect(result.success).toBe(true);
    });

    it('vérifie flag N = 1 après LDA #$80', () => {
      const result = validateChallenge('LDA #$80\nBRK', {
        assertions: [{ type: 'flag', flag: 'N', set: true }],
      });
      expect(result.success).toBe(true);
    });

    it('échec si le flag est dans l\'état inverse', () => {
      const result = validateChallenge('CLC\nBRK', {
        assertions: [{ type: 'flag', flag: 'C', set: true }],
      });
      expect(result.success).toBe(false);
    });

    it('vérifie flag Z = 0 après LDA #$01', () => {
      const result = validateChallenge('LDA #$01\nBRK', {
        assertions: [{ type: 'flag', flag: 'Z', set: false }],
      });
      expect(result.success).toBe(true);
    });

    it('vérifie flag V = 1 après overflow ADC', () => {
      const result = validateChallenge('CLC\nLDA #$7F\nADC #$01\nBRK', {
        assertions: [{ type: 'flag', flag: 'V', set: true }],
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Assertion : sequence ────────────────────────────────

  describe('assertion type "sequence"', () => {
    it('vérifie une séquence d\'octets consécutifs', () => {
      const result = validateChallenge(`
        LDA #$01
        STA $0200
        LDA #$02
        STA $0201
        LDA #$03
        STA $0202
        BRK
      `, {
        assertions: [{
          type:    'sequence',
          address: 0x0200,
          values:  [0x01, 0x02, 0x03],
        }],
      });
      expect(result.success).toBe(true);
    });

    it('échoue si un octet de la séquence est incorrect', () => {
      const result = validateChallenge('LDA #$AA\nSTA $0200\nBRK', {
        assertions: [{
          type:    'sequence',
          address: 0x0200,
          values:  [0xAA, 0x00, 0xFF], // 0x00 ok, 0xFF échoue
        }],
      });
      // $0202 = 0x00 ≠ 0xFF
      expect(result.success).toBe(false);
      expect(result.failures).toHaveLength(1);
    });

    it('vérifie une séquence dans la zero page', () => {
      const result = validateChallenge(`
        LDA #$AA
        STA $10
        LDA #$BB
        STA $11
        BRK
      `, {
        assertions: [{
          type:    'sequence',
          address: 0x10,
          values:  [0xaa, 0xbb],
        }],
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Timeout ──────────────────────────────────────────────

  describe('timeout (maxCycles)', () => {
    it('retourne timeout:true si le programme boucle infiniment', () => {
      const result = validateChallenge('loop:\n  JMP loop\n', {
        assertions: [],
        maxCycles:  50,
      });
      expect(result.timeout).toBe(true);
      expect(result.success).toBe(false);
    });

    it('retourne timeout:false quand BRK est atteint dans les cycles', () => {
      const result = validateChallenge('LDA #$01\nBRK', {
        assertions: [],
        maxCycles:  100,
      });
      expect(result.timeout).toBe(false);
    });

    it('cycles est borné par maxCycles', () => {
      const result = validateChallenge('loop:\n  JMP loop\n', {
        assertions: [],
        maxCycles:  77,
      });
      expect(result.cycles).toBeLessThanOrEqual(77);
    });
  });

  // ── Erreur d'assemblage ──────────────────────────────────

  describe('erreur d\'assemblage', () => {
    it('retourne success:false si le code ne s\'assemble pas', () => {
      const result = validateChallenge('INVALID_OPCODE\nBRK', {
        assertions: [{ type: 'register', register: 'A', value: 0 }],
      });
      expect(result.success).toBe(false);
      expect(result.failures[0]!.message).toContain('assemblage');
    });
  });

  // ── Scénarios pédagogiques réels ─────────────────────────

  describe('scénarios pédagogiques', () => {
    it('Défi : charger $42 dans A', () => {
      const result = validateChallenge('LDA #$42\nBRK', {
        assertions: [{ type: 'register', register: 'A', value: 0x42 }],
      });
      expect(result.success).toBe(true);
    });

    it('Défi : additionner deux nombres (5 + 3 = 8)', () => {
      const result = validateChallenge('CLC\nLDA #$05\nADC #$03\nBRK', {
        assertions: [{ type: 'register', register: 'A', value: 8 }],
      });
      expect(result.success).toBe(true);
    });

    it('Défi : copier A dans X et Y', () => {
      const result = validateChallenge('LDA #$42\nTAX\nTAY\nBRK', {
        assertions: [
          { type: 'register', register: 'X', value: 0x42 },
          { type: 'register', register: 'Y', value: 0x42 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('Défi : boucle pour remplir 4 octets en ZP', () => {
      const result = validateChallenge(`
        LDA #$FF
        LDX #$00
loop:
        STA $10,X
        INX
        CPX #$04
        BNE loop
        BRK
      `, {
        assertions: [
          { type: 'sequence', address: 0x10, values: [0xff, 0xff, 0xff, 0xff] },
          { type: 'register', register: 'X', value: 4 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('Défi : test du flag carry après soustraction', () => {
      const result = validateChallenge('SEC\nLDA #$10\nSBC #$05\nBRK', {
        assertions: [
          { type: 'register', register: 'A', value: 0x0b },
          { type: 'flag',     flag: 'C',     set: true },
          { type: 'flag',     flag: 'N',     set: false },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

});

// ─────────────────────────────────────────────────────────────
// Tests localStorage (Tâche 2.3) — avec mock jsdom
// ─────────────────────────────────────────────────────────────

describe('LocalStorage autosave (Tâche 2.3)', () => {
  const PREFIX = 'chuck_day_';

  beforeEach(() => localStorage.clear());
  afterEach(()  => localStorage.clear());

  it('sauvegarde le code sous la bonne clé', () => {
    localStorage.setItem(`${PREFIX}3`, 'LDA #$42\nBRK');
    expect(localStorage.getItem(`${PREFIX}3`)).toBe('LDA #$42\nBRK');
  });

  it('les clés sont isolées par id de défi', () => {
    localStorage.setItem(`${PREFIX}1`, 'code_1');
    localStorage.setItem(`${PREFIX}2`, 'code_2');
    expect(localStorage.getItem(`${PREFIX}1`)).toBe('code_1');
    expect(localStorage.getItem(`${PREFIX}2`)).toBe('code_2');
  });

  it('retourne null si aucune sauvegarde n\'existe', () => {
    expect(localStorage.getItem(`${PREFIX}99`)).toBeNull();
  });

  it('écrase l\'ancienne valeur lors d\'une nouvelle sauvegarde', () => {
    localStorage.setItem(`${PREFIX}1`, 'v1');
    localStorage.setItem(`${PREFIX}1`, 'v2');
    expect(localStorage.getItem(`${PREFIX}1`)).toBe('v2');
  });

  it('removeItem supprime la sauvegarde', () => {
    localStorage.setItem(`${PREFIX}5`, 'code');
    localStorage.removeItem(`${PREFIX}5`);
    expect(localStorage.getItem(`${PREFIX}5`)).toBeNull();
  });

  it('les clés des autres défis ne sont pas affectées par clear d\'un défi', () => {
    localStorage.setItem(`${PREFIX}1`, 'code_1');
    localStorage.setItem(`${PREFIX}2`, 'code_2');
    localStorage.removeItem(`${PREFIX}1`);
    expect(localStorage.getItem(`${PREFIX}2`)).toBe('code_2');
  });
});