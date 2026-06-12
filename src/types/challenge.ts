/* ─────────────────────────────────────────────────────────────
   Chuck IDE — types/challenge.ts
   Types TypeScript pour challenges.json.
   ───────────────────────────────────────────────────────────── */

// ── Condition de validation ───────────────────────────────────

/** Vérifie la valeur d'un registre après exécution */
export interface RegisterAssertion {
  type:     'register';
  register: 'A' | 'X' | 'Y' | 'PC' | 'SP' | 'P';
  value:    number;       // valeur attendue (ex: 0x42)
  /** Message affiché en cas d'échec. Si absent, un message générique est généré. */
  failMsg?: string;
}

/** Vérifie la valeur d'une adresse mémoire après exécution */
export interface MemoryAssertion {
  type:     'memory';
  address:  number;       // ex: 0x0010
  value:    number;
  failMsg?: string;
}

/** Vérifie qu'un flag du registre P est dans l'état attendu */
export interface FlagAssertion {
  type:    'flag';
  flag:    'C' | 'Z' | 'N' | 'V' | 'I' | 'D' | 'B';
  set:     boolean;       // true = flag doit être à 1
  failMsg?: string;
}

/** Vérifie qu'une zone mémoire contient une séquence d'octets */
export interface SequenceAssertion {
  type:    'sequence';
  address: number;
  values:  number[];      // octets attendus consécutifs
  failMsg?: string;
}

export type Assertion =
  | RegisterAssertion
  | MemoryAssertion
  | FlagAssertion
  | SequenceAssertion;

// ── Structure d'un défi ───────────────────────────────────────

export interface ChallengeHint {
  /** Texte de l'indice (révélé progressivement) */
  text:     string;
  /** Coût en points si l'indice est utilisé (optionnel) */
  cost?:    number;
}

export interface ChallengeMeta {
  /** Référence au livre de Rodnay Zaks "Programming the 6502" */
  zaks?: {
    chapter: string;  // ex: "Chapitre 3"
    page:    number;  // ex: 87
    topic:   string;  // ex: "Adressage indirect indexé"
  };
  /** Concepts 6502 abordés dans ce défi */
  concepts?: string[];  // ex: ["LDA", "STA", "boucle"]
  /** Durée estimée en minutes */
  estimatedMinutes?: number;
}

export interface Challenge {
  /** Identifiant unique — correspond au paramètre URL ?challenge=X */
  id:          number;
  /** Titre court affiché dans le panneau */
  title:       string;
  /** Description Markdown de la consigne */
  description: string;
  /** Code de départ injecté dans l'éditeur (template vide ou squelette) */
  template:    string;
  /** Liste ordonnée des assertions à valider */
  assertions:  Assertion[];
  /** Nombre max de cycles CPU avant timeout (évite les boucles infinies) */
  maxCycles?:  number;       // défaut : 10_000
  /** Indices progressifs */
  hints?:      ChallengeHint[];
  /** Métadonnées pédagogiques */
  meta?:       ChallengeMeta;
}

// ── Structure de challenges.json ──────────────────────────────

export interface ChallengesFile {
  version:    string;       // ex: "1.0.0"
  challenges: Challenge[];
}

// ── Résultat de validation ────────────────────────────────────

export interface ValidationResult {
  success:   boolean;
  /** Assertions qui ont échoué */
  failures:  AssertionFailure[];
  /** Nombre de cycles CPU utilisés */
  cycles:    number;
  /** true si le CPU n'a pas atteint BRK dans maxCycles */
  timeout:   boolean;
}

export interface AssertionFailure {
  assertion: Assertion;
  expected:  number | boolean;
  actual:    number | boolean;
  message:   string;
}
