# DMN Playground

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> [!WARNING]
> This project is primarily developed using AI coding agents (GitHub Copilot).
> All code is reviewed before merging, but please report any issues you find.

A standalone, browser-based **DMN (Decision Model and Notation) playground** that
evaluates DMN 1.3 decision tables, literal expressions, and decision requirements
graphs — **no backend required**. Everything runs in the browser.

The playground is designed for **[Operaton](https://github.com/operaton/operaton) /
Camunda 7 compatibility**: it produces the same evaluation results as the Operaton
BPM engine for the same DMN model and input data.

## Features

- 📄 **Load DMN files** — drag & drop, file picker, or paste XML
- ▶ **Evaluate decisions** — input values via auto-generated forms
- 🔗 **Decision Requirements Graphs** — cascading evaluation across dependent decisions
- 🎯 **All hit policies** — UNIQUE, ANY, FIRST, RULE ORDER, COLLECT (with SUM/MIN/MAX/COUNT)
- 📊 **Batch evaluation** — evaluate multiple input sets at once (CSV or JSON)
- 🔀 **Model comparison** — structural diff between two DMN models
- ✏️ **Edit mode** — modify decision tables in the browser
- 🔄 **Dual FEEL engines** — switch between `feelin` (JS) and `feel-scala` (Scala.js)
- 🌗 **Dark/light theme** — respects system preference
- 📤 **Share via URL** — encode input data and DMN in shareable links
- 📱 **PWA support** — installable as a progressive web app

## FEEL Backends

The playground supports two pluggable FEEL expression engines:

| Backend | Description | Fidelity |
|---|---|---|
| **feelin** | Lightweight JS FEEL interpreter ([nikku/feelin](https://github.com/nikku/feelin)) | Good for most expressions |
| **feel-scala** | Production FEEL engine from Operaton/Camunda 7, compiled to JS via Scala.js ([camunda/feel-scala](https://github.com/camunda/feel-scala)) | Production parity |

The FEEL backend can be switched at runtime via the UI dropdown.

## Getting Started

### Prerequisites

- **Node.js 22+**
- **Java 21+** and **sbt** (only needed for building the feel-scala backend)

### Development

```bash
# Install dependencies
npm install

# Build the feel-scala Scala.js bundle (optional, requires Java + sbt)
make build-feel-scala

# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint & format
npm run lint
npm run format

# Full check (format + lint + test)
make check
```

### Build for Production

```bash
npm run build
```

The output is placed in `dist/` and can be served as a static site.

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

## Project Structure

```
dmn-playground/
├── src/
│   ├── engine/           # Core DMN evaluation engine
│   │   ├── evaluate.js   # Main evaluation entry point
│   │   ├── hit-policy.js # Hit-policy implementations
│   │   ├── drg.js        # Decision Requirements Graph resolver
│   │   ├── batch.js      # Batch evaluation
│   │   ├── compare.js    # Model comparison / structural diff
│   │   ├── types.js      # Type coercion & validation
│   │   └── feel/         # Pluggable FEEL provider
│   │       ├── provider.js       # FeelProvider interface
│   │       ├── feelin.js         # feelin adapter
│   │       ├── feel-scala.js     # feel-scala Scala.js adapter
│   │       └── registry.js       # Runtime provider selection
│   ├── parser/           # DMN XML → internal model
│   │   └── parse.js      # Uses dmn-moddle
│   ├── ui/               # Browser UI components
│   │   ├── App.js        # Main application
│   │   ├── Viewer.js     # dmn-js integration & DRD simulation
│   │   ├── InputForm.js  # Dynamic input form
│   │   ├── blank-dmn.js  # Blank DMN template for new projects
│   │   └── url-state.js  # URL encoding/decoding
│   └── index.js          # Entry point & public API
├── test/                 # Vitest test suites
├── feel-scala/           # Scala.js build for feel-scala
├── public/               # Static assets & PWA manifest
└── .github/workflows/    # CI & deployment
```

## DRD Simulation

When evaluating decisions that form a Decision Requirements Graph (DRG), the
playground provides a rich visual simulation on top of the DRD diagram.

### Evaluation Overlays

After evaluating a decision with dependencies, the DRD view shows:

- **Order badges** — numbered circles on each decision indicating evaluation order
- **Result overlays** — compact result preview below each decision node
- **Status markers** — green (evaluated), red (error), or purple (what-if override)
- **Dimmed decisions** — decisions not participating in the evaluation are dimmed

### Interactive Navigation

- **Click** a decision overlay in the DRD to navigate to its decision table and
  see the highlighted matched rules
- Use **View DRD** button to return to the DRD overview with overlays
- **Toggle Overlays** to show/hide evaluation indicators
- **Reset** clears all highlights and evaluation state

### DRD Controls

The DRD controls toolbar appears after evaluating a multi-decision graph:

| Control | Action |
|---|---|
| 🔀 View DRD | Navigate to DRD view with evaluation overlays |
| 👁 Hide/Show Overlays | Toggle visibility of evaluation indicators |
| 🔄 Reset | Clear all DRD highlights and evaluation state |

### API

The DRD simulation is powered by functions on the viewer controller:

- **`highlightDecisions(trace, options)`** — Render evaluation overlays on the
  DRD. Accepts an array of `EvaluationTrace` entries and an optional
  `onDecisionClick` callback for interactive navigation.
- **`clearDecisionHighlights()`** — Remove all evaluation overlays and markers.
- **`navigateToDecision(decisionId)`** — Open a specific decision's table or
  literal expression view.
- **`navigateToDrd()`** — Navigate back to the DRD overview.
- **`formatOverlayResult(value)`** — Format a result value for compact overlay
  display (truncates long values).

### Creating New DMN Projects

Click the **📄 New** button in the toolbar to create a blank DMN project with:

- A single decision table with UNIQUE hit policy
- One input and one output column
- A wildcard rule that matches any input
- The editor automatically opens in edit mode

## Core Libraries

| Library | Purpose | License |
|---|---|---|
| [feelin](https://github.com/nikku/feelin) | FEEL expression parser & interpreter (JS) | MIT |
| [feel-scala](https://github.com/camunda/feel-scala) | FEEL engine from Operaton/Camunda 7 (Scala.js) | Apache 2.0 |
| [dmn-moddle](https://github.com/bpmn-io/dmn-moddle) | DMN 1.3 XML ↔ JS object model | MIT |
| [camunda-dmn-moddle](https://github.com/camunda/camunda-dmn-moddle) | Camunda/Operaton DMN extensions | MIT |
| [dmn-js](https://github.com/bpmn-io/dmn-js) | DMN diagram viewer/editor | bpmn.io |

## License

This project is licensed under the [Apache License 2.0](LICENSE).
