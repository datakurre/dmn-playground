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
│   │   ├── Viewer.js     # dmn-js integration
│   │   ├── InputForm.js  # Dynamic input form
│   │   └── url-state.js  # URL encoding/decoding
│   └── index.js          # Entry point & public API
├── test/                 # Vitest test suites
├── feel-scala/           # Scala.js build for feel-scala
├── public/               # Static assets & PWA manifest
└── .github/workflows/    # CI & deployment
```

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
