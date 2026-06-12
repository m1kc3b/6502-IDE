/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/fixtures/programs.ts
   Programmes 6502 de référence pour les tests.
   Chaque programme documente son comportement attendu.
   ───────────────────────────────────────────────────────────── */

/** LDA #$42 — charge 0x42 dans A puis BRK */
export const LOAD_IMMEDIATE = `
  LDA #$42
  BRK
`;

/** LDA + STA en zero page */
export const STORE_ZERO_PAGE = `
  LDA #$FF
  STA $10
  BRK
`;

/** Boucle : INX de 0 à 5 */
export const LOOP_INX = `
  LDX #$00
loop:
  INX
  CPX #$05
  BNE loop
  BRK
`;

/** ADC simple sans carry */
export const ADD_NO_CARRY = `
  CLC
  LDA #$10
  ADC #$20
  BRK
`;

/** ADC avec carry entrant */
export const ADD_WITH_CARRY = `
  SEC
  LDA #$10
  ADC #$20
  BRK
`;

/** SBC simple */
export const SUB_SIMPLE = `
  SEC
  LDA #$50
  SBC #$10
  BRK
`;

/** Teste le flag Z (résultat zéro) */
export const SET_ZERO_FLAG = `
  SEC
  LDA #$01
  SBC #$01
  BRK
`;

/** Teste le flag N (résultat négatif bit 7 = 1) */
export const SET_NEGATIVE_FLAG = `
  LDA #$80
  BRK
`;

/** JSR + RTS */
export const JSR_RTS = `
  JSR subroutine
  LDX #$AA
  BRK
subroutine:
  LDA #$42
  RTS
`;

/** PHA / PLA */
export const STACK_PUSH_POP = `
  LDA #$77
  PHA
  LDA #$00
  PLA
  BRK
`;

/** Branchement BNE forward */
export const BRANCH_BNE = `
  LDX #$03
loop:
  DEX
  BNE loop
  BRK
`;

/** Branchement BEQ */
export const BRANCH_BEQ = `
  LDA #$00
  BEQ target
  LDA #$FF
target:
  BRK
`;

/** AND immédiat */
export const AND_IMM = `
  LDA #$FF
  AND #$0F
  BRK
`;

/** ORA immédiat */
export const ORA_IMM = `
  LDA #$F0
  ORA #$0F
  BRK
`;

/** EOR immédiat */
export const EOR_IMM = `
  LDA #$FF
  EOR #$0F
  BRK
`;

/** ASL accumulator */
export const ASL_ACC = `
  LDA #$01
  ASL
  ASL
  BRK
`;

/** LSR accumulator */
export const LSR_ACC = `
  LDA #$08
  LSR
  LSR
  BRK
`;

/** ROL — rotate left avec carry */
export const ROL_CARRY = `
  SEC
  LDA #$00
  ROL
  BRK
`;

/** ROR — rotate right avec carry */
export const ROR_CARRY = `
  SEC
  LDA #$00
  ROR
  BRK
`;

/** INC / DEC mémoire zero page */
export const INC_DEC_MEMORY = `
  LDA #$05
  STA $20
  INC $20
  INC $20
  DEC $20
  BRK
`;

/** Adressage absolu */
export const ABSOLUTE_ADDR = `
  LDA #$AB
  STA $0300
  LDA #$00
  LDA $0300
  BRK
`;

/** LDX / LDY / STX / STY */
export const XY_REGISTERS = `
  LDX #$AA
  LDY #$BB
  STX $10
  STY $11
  BRK
`;

/** TAX / TAY / TXA / TYA */
export const TRANSFERS = `
  LDA #$42
  TAX
  TAY
  BRK
`;

/** CMP — compare A avec une valeur */
export const CMP_CARRY = `
  LDA #$10
  CMP #$05
  BRK
`;

/** CPX / CPY */
export const CPX_CPY = `
  LDX #$10
  CPX #$10
  LDY #$20
  CPY #$10
  BRK
`;

/** BIT — test bits */
export const BIT_TEST = `
  LDA #$C0
  STA $10
  LDA #$80
  BIT $10
  BRK
`;

/** INX / INY / DEX / DEY */
export const INC_DEC_REGS = `
  LDX #$FE
  INX
  INX
  DEX
  LDY #$01
  DEY
  BRK
`;

/** Adressage indexé abs,X */
export const INDEXED_X = `
  LDA #$AA
  LDX #$02
  STA $0200,X
  BRK
`;

/** Adressage indexé abs,Y */
export const INDEXED_Y = `
  LDA #$BB
  LDY #$03
  STA $0300,Y
  BRK
`;

/** Adressage (zp,X) indirect indexé */
export const INDIRECT_X = `
  LDA #$00
  STA $10
  LDA #$02
  STA $11
  LDA #$CC
  LDX #$00
  STA ($10,X)
  BRK
`;

/** Adressage (zp),Y post-indexé */
export const INDIRECT_Y = `
  LDA #$00
  STA $20
  LDA #$02
  STA $21
  LDA #$DD
  LDY #$05
  STA ($20),Y
  BRK
`;

/** Programme complet : remplissage zone mémoire */
export const FILL_MEMORY = `
  LDA #$AA
  LDX #$00
fill:
  STA $0200,X
  INX
  CPX #$08
  BNE fill
  BRK
`;

/** CLV — efface le flag overflow */
export const CLV_TEST = `
  LDA #$7F
  ADC #$01
  CLV
  BRK
`;

/** SEC / CLC */
export const SEC_CLC = `
  SEC
  CLC
  SEC
  BRK
`;

/** TXS / TSX */
export const TXS_TSX = `
  LDX #$EE
  TXS
  LDX #$00
  TSX
  BRK
`;
