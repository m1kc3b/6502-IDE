# Chuck IDE — V0.1.0
### L'Atelier 8-Bit — par L'Archéogeek

IDE 6502 moderne dans le navigateur, orienté défis pédagogiques.  
Stack : **Vite + TypeScript + Web Components natifs** — zéro framework.

---

## Démarrage rapide

```bash
npm install
npm run dev        # → http://localhost:3000
```

## Build production

```bash
npm run build      # → dist/
npm run preview    # tester le build local
npm run typecheck  # vérification TypeScript seule
```

---

## Architecture

```
chuck-ide/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml                        # Cloudflare Pages
├── .github/workflows/deploy.yml        # CI/CD GitHub Actions
│
├── public/
│   ├── challenges.json                  # Défis (à remplir)
│   ├── _headers                         # Cache + sécurité CF Pages
│   └── _redirects                       # SPA fallback CF Pages
│
└── src/
    ├── main.ts                          # Point d'entrée
    ├── styles/
    │   ├── tokens.css                   # CSS Variables partagées
    │   └── global.css                   # Layout shell
    ├── types/
    │   ├── cpu.ts                       # CpuState, FLAGS, MachineStatus
    │   └── challenge.ts                 # Challenge, Assertion, ValidationResult
    ├── core/
    │   ├── bus.ts                       # Event Bus typé (CustomEvent)
    │   ├── base-component.ts            # Classe de base Web Component
    │   ├── memory.ts                    # Ram64K (Uint8Array 64 Ko)
    │   ├── display.ts                   # Display6502 (canvas 32×32)
    │   ├── assembler.ts                 # Assembler6502 (2 passes)
    │   ├── cpu.ts                       # Cpu6502 (151 opcodes, headless)
    │   ├── emulator.ts                  # Façade : relie tout au Bus
    │   └── challenge-manager.ts        # Routeur URL + localStorage + validation
    └── components/
        ├── chuck-toolbar.ts             # <chuck-toolbar>
        ├── chuck-editor.ts              # <chuck-editor> (CodeMirror 6)
        ├── chuck-display.ts             # <chuck-display> modale canvas
        ├── chuck-registers.ts           # <chuck-registers> modale registres
        ├── chuck-memory-dump.ts         # <chuck-memory-dump> Zero Page
        └── chuck-challenge-panel.ts    # <chuck-challenge-panel> consigne
```

---

## Ajouter des défis

Éditer `public/challenges.json` :

```json
{
  "version": "1.0.0",
  "challenges": [
    {
      "id": 1,
      "title": "Charger une valeur",
      "description": "## Objectif\n\nChargez la valeur `$42` dans l'accumulateur A.",
      "template": "; Défi 1\n\n  ; TODO : charger $42 dans A\n\n  BRK\n",
      "assertions": [
        { "type": "register", "register": "A", "value": 66 }
      ],
      "maxCycles": 10000,
      "hints": [{ "text": "Utilisez l'instruction LDA en mode immédiat." }],
      "meta": {
        "zaks": { "chapter": "Chapitre 3", "page": 45, "topic": "Modes d'adressage" },
        "concepts": ["LDA"],
        "estimatedMinutes": 5
      }
    }
  ]
}
```

### Types d'assertions disponibles

| type | champs | exemple |
|------|--------|---------|
| `register` | `register`, `value` | `{ "type":"register","register":"A","value":66 }` |
| `memory` | `address`, `value` | `{ "type":"memory","address":16,"value":255 }` |
| `flag` | `flag`, `set` | `{ "type":"flag","flag":"Z","set":true }` |
| `sequence` | `address`, `values` | `{ "type":"sequence","address":512,"values":[1,2,3] }` |

### URL de navigation

```
http://localhost:3000/?challenge=1   # Jour 1
http://localhost:3000/?challenge=12  # Jour 12
```

---

## Déploiement Cloudflare Pages

### 1. Créer le projet CF Pages (une seule fois)

```bash
npx wrangler pages project create chuck-ide
```

### 2. Ajouter les secrets GitHub

Dans **Settings → Secrets and variables → Actions** du dépôt :

| Secret | Valeur |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Token CF — permission *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID du dashboard CF |

### 3. Pousser sur main

```bash
git push origin main
# → build automatique + déploiement sur chuck-ide.pages.dev
```

Chaque **pull request** obtient une URL de preview unique.

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl/Cmd + Shift + B` | Assembler |
| `F5` | Run |
| `F10` | Step (pas à pas) |
| Clic gouttière gauche | Poser / retirer un breakpoint |
| `Tab` | Indent 2 espaces |

---

## Checklist MVP V0.1.0

| Étape | Tâche | ✅ |
|-------|-------|----|
| 1.1 | Vite + TypeScript | ✅ |
| 1.2 | Web Components + Event Bus typé | ✅ |
| 1.3 | Routeur URL `?challenge=X` | ✅ |
| 2.1 | `Cpu6502` + `Ram64K` + `Assembler6502` | ✅ |
| 2.2 | `.reset()` + `chuck:cpu-reset` | ✅ |
| 2.3 | Autosave localStorage | ✅ |
| 3.1 | CodeMirror 6 dans `<chuck-editor>` | ✅ |
| 3.2 | Coloration ASM 6502 + breakpoints gutter | ✅ |
| 3.3 | Moteur de validation headless | ✅ |
| 4.1 | `<chuck-registers>` réactifs + flash | ✅ |
| 4.2 | `<chuck-memory-dump>` Zero Page | ✅ |
| 4.3 | `<chuck-challenge-panel>` + bouton Valider | ✅ |
| 5.1 | Slider vitesse + Play/Pause/Step | ✅ |
| 5.2 | `<chuck-display>` canvas 32×32 | ✅ |
| 6.1 | Dark mode CSS (tokens + Shadow DOM) | ✅ |
| 6.2 | Export `.asm` | ✅ |
| 6.3 | CI/CD Cloudflare Pages | ✅ |

---

## Licence

GPL v3 — moteur 6502 basé sur [easy6502](https://github.com/skilldrick/6502js) de Nick Morgan / Stian Soreng.
