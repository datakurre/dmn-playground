# Agent Guidelines — DMN Simulator

## Project Overview

**dmn-simulator** is a standalone browser-based DMN (Decision Model and Notation)
simulator. It evaluates DMN 1.3 decision tables, literal expressions, and
decision requirements graphs in the browser — no backend required.

The **DMN engine** (decision table matching, hit policies, DRG resolution) is
**reimplemented in JavaScript**, modeled after Operaton's `engine-dmn/engine/`.
FEEL expression evaluation is delegated to a **pluggable FEEL provider** with
two backends:

1. **`feelin`** (JS) — lightweight, works out of the box, good default
2. **`feel-scala`** (Scala.js) — the production FEEL engine used by
   Operaton/Camunda 7, compiled to JS for maximum fidelity

The goal is **Operaton/Camunda 7 compatible evaluation**: the simulator should
produce the same results as the Operaton BPM engine for the same DMN model and
input data. Using `feel-scala` as a FEEL backend ensures production parity for
FEEL expressions; the JS DMN engine mirrors Operaton's evaluation logic.

## Key Technologies

- **JavaScript/TypeScript** — primary language
- **Node.js 22+** — development runtime
- **Vite** — build tool and dev server
- **Vitest** — unit testing
- **ESLint + Prettier** — code quality
- **devenv (Nix)** — development environment management

## Core Libraries

| Library | Purpose | License |
|---|---|---|
| [`feelin`](https://github.com/nikku/feelin) | FEEL expression parser & interpreter (JS, lightweight) | MIT |
| [`feel-scala`](https://github.com/camunda/feel-scala) | FEEL engine used by Operaton/Camunda 7 (Scala → JS via Scala.js) | Apache 2.0 |
| [`dmn-moddle`](https://github.com/bpmn-io/dmn-moddle) | DMN 1.3 XML ↔ JavaScript object model | MIT |
| [`camunda-dmn-moddle`](https://github.com/camunda/camunda-dmn-moddle) | Camunda/Operaton DMN extension attributes | MIT |
| [`dmn-js`](https://github.com/bpmn-io/dmn-js) | DMN diagram viewer/editor for the browser | bpmn.io |

> **Note:** `feelin` and `feel-scala` are **FEEL expression evaluators only**.
> They do NOT implement the DMN engine (decision table matching, hit policies,
> DRG resolution). The DMN engine logic is **reimplemented in JavaScript** in
> this project, modeled after Operaton's `engine-dmn/engine/`.

## Architecture

```
DMN XML (file / paste / URL)
        │
        ▼
   dmn-moddle          ← parse XML into JS object model
   + camunda-dmn-moddle  (with Operaton extension attributes)
        │
        ▼
   Decision Model      ← internal representation
   (tables, literal     (extracted from moddle objects)
    expressions, DRG)
        │
        ▼
   DMN Engine (JS)     ← reimplemented in JavaScript
   ├─ Hit-policy logic  (UNIQUE, ANY, FIRST, RULE ORDER, COLLECT+agg)
   ├─ DRG resolver      (topological sort, cascading evaluation)
   └─ FEEL Provider    ← pluggable interface
       ├─ feelin        (JS, default — lightweight)
       └─ feel-scala    (Scala.js — production parity)
        │
        ▼
   Results + Trace     ← matched rules, outputs, audit log
        │
        ▼
   dmn-js Viewer       ← display DRD & decision tables
   + Simulation UI       with highlighted matched rules
```

## Reference: How Operaton Evaluates DMN

Operaton's DMN engine lives in `engine-dmn/` inside the
[operaton/operaton](https://github.com/operaton/operaton) repository:

- **`engine-dmn/engine/`** — core evaluation: transforms DMN XML into an internal
  model, evaluates rules against input data, applies hit policies
- **`engine-dmn/feel-scala/`** — Scala-based FEEL engine (the default in modern
  Operaton; wraps [feel-scala](https://github.com/camunda/feel-scala))
- **`engine-dmn/feel-juel/`** — legacy JUEL-based FEEL (deprecated, for reference)
- **`engine-dmn/feel-api/`** — SPI for pluggable FEEL providers

### Decision Table Evaluation Flow (Java)

1. **Parse** DMN XML via `DmnTransformer` → `DmnDecision` model objects
2. **Evaluate input expressions** against the variable context using FEEL
3. **Match rules**: for each rule, evaluate input entries (unary tests) against
   input expression results
4. **Apply hit policy** to collect/filter/aggregate matched rule outputs
5. **Return** `DmnDecisionTableResult` (list of `DmnDecisionRuleResult` maps)

### Hit Policies

| Policy | Behavior |
|---|---|
| UNIQUE | At most one rule may match |
| ANY | Multiple matches allowed if all produce same output |
| FIRST | Return output of first matching rule |
| RULE ORDER | Return all matching outputs in table order |
| COLLECT | Return all matching outputs as list |
| COLLECT+SUM | Sum numeric outputs |
| COLLECT+MIN | Smallest numeric output |
| COLLECT+MAX | Largest numeric output |
| COLLECT+COUNT | Count of matching rules |

## Development Environment

This project uses [devenv](https://devenv.sh/) for reproducible development
environments.

```bash
# Enter the dev shell (installs Node.js, tools, etc.)
devenv shell

# Install npm dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Lint & format
npm run lint
npm run format
```

## File Structure (Planned)

```
dmn-simulator/
├── src/
│   ├── engine/           # Core DMN evaluation engine (reimplemented in JS)
│   │   ├── evaluate.js   # Main evaluation entry point
│   │   ├── hit-policy.js # Hit-policy implementations
│   │   ├── drg.js        # Decision Requirements Graph resolver
│   │   ├── types.js      # Type coercion & validation
│   │   └── feel/         # Pluggable FEEL provider
│   │       ├── provider.js       # FeelProvider interface
│   │       ├── feelin.js         # feelin adapter (default)
│   │       └── feel-scala.js     # feel-scala Scala.js adapter
│   ├── parser/           # DMN XML → internal model
│   │   └── parse.js      # Uses dmn-moddle
│   ├── ui/               # Browser UI components
│   │   ├── App.js        # Main application
│   │   ├── Viewer.js     # dmn-js integration
│   │   └── InputForm.js  # Dynamic input form
│   └── index.js          # Entry point
├── test/                 # Vitest test suites
│   ├── engine/
│   ├── parser/
│   └── fixtures/         # Sample DMN files
├── public/               # Static assets
├── devenv.nix            # Nix development environment
├── devenv.yaml           # devenv inputs
├── package.json
├── vite.config.js
├── AGENTS.md             # ← this file
└── TODO.md               # Task tracking
```

## Code Style

- **ES Modules** (`import`/`export`) — no CommonJS
- **2 spaces** indentation
- **Single quotes**, semicolons
- **Prettier** for formatting, **ESLint** for linting
- Prefer **pure functions** and **immutable data** in the engine
- Keep the engine **dependency-free** except for `feelin`, `feel-scala`, and
  `dmn-moddle`

## Important Notes

- **No backend required** — everything runs in the browser
- **Operaton compatibility** is the north star — when in doubt, match Operaton's
  behavior (which is identical to Camunda 7.24)
- **DMN 1.3** is the target specification version
- **`feelin` and `feel-scala` are FEEL-only** — they evaluate FEEL expressions
  and unary tests but do NOT implement DMN engine logic (decision tables, hit
  policies, DRG). The DMN engine is **reimplemented in JS** in this project.
- **Dual FEEL backends:** `feelin` (JS) is the lightweight default; `feel-scala`
  (Scala.js) is the production engine for maximum Operaton fidelity. The engine
  uses a pluggable `FeelProvider` interface so backends can be swapped at runtime.
- The `camunda-dmn-moddle` extensions are needed to read Operaton-specific
  attributes like `historyTimeToLive`, `versionTag`, etc.
