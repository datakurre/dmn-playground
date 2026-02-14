# DRD Simulation User Guide

This guide explains how to use the Decision Requirements Diagram (DRD) simulation
features in the DMN Playground.

## Overview

When a DMN model contains multiple decisions linked by information requirements
(a Decision Requirements Graph), the DMN Playground evaluates them in dependency
order and visualizes the entire evaluation flow on the DRD diagram.

## Getting Started

1. **Load a DMN file** that contains multiple interconnected decisions
   (a Decision Requirements Graph)
2. **Select the target decision** from the dropdown — this is the "root" decision
   whose result you want
3. **Fill in the input data** in the auto-generated form
4. **Click Evaluate** (or press `Ctrl+Enter`)

The playground will:
- Resolve all decision dependencies (topological sort)
- Evaluate each decision in order, passing outputs forward
- Display results on the DRD diagram

## DRD Evaluation Overlays

After evaluation, the DRD diagram shows:

### Order Badges

Each evaluated decision gets a **numbered badge** (①, ②, ③…) showing the
evaluation order. This helps you understand the dependency resolution sequence.

### Result Overlays

Below each decision node, a **result overlay** shows:
- **▦** — Decision table result
- **𝑓** — Literal expression result
- **⚡** — Overridden value (from the Override form)
- **❌** — Evaluation error

The overlay displays a compact representation of the result value.
Hover over it for full details including inputs, outputs, and duration.

### Color Coding

| Color | Meaning |
|-------|---------|
| **Green outline** | Successfully evaluated decision |
| **Red outline** | Decision that encountered an error |
| **Blue/purple outline** | Overridden decision (value supplied manually) |
| **Dimmed (faded)** | Decision not involved in the current evaluation |

### Timing Information

Each overlay shows the evaluation duration in milliseconds, helping you
identify slow-evaluating decisions.

## Interacting with the DRD

### Click to Navigate

Click on any decision's result overlay to navigate to its decision table
or literal expression view. If the decision is a table with matched rules,
those rules will be highlighted.

## Data Flow Visualization

After evaluation, click the **🔗 Data Flow** button to display value annotations
on the connections (arrows) between decisions. Each label shows the value passed
from one decision to the next.

### How It Works

- Each arrow (information requirement) between decisions gets a small label
  showing the output value of the upstream decision
- Hover over a label to see the full value detail in a tooltip
- Labels expand on hover to show truncated values
- Click **🔗 Hide Flow** to remove the labels

### Reading Data Flow

| Label | Meaning |
|-------|---------|
| `42` | Numeric value passed |
| `"Gold"` | String value passed |
| `∅` | Null/undefined value |
| `{"a":1}` | Object value (truncated if long) |

### Use Cases

- **Trace data through the graph**: See exactly what value each decision
  produced and passed to its dependents
- **Debug unexpected results**: When a decision produces the wrong output,
  check the values it received from upstream decisions
- **Understand the model**: Quickly see the data dependencies without
  clicking through each decision individually

### Trace Table Synchronization

The **Evaluation Trace** table below the diagram is synchronized with the DRD:

- **Click a trace row** → navigates to that decision's table view and
  highlights matched rules
- **Click a DRD decision overlay** → scrolls the trace table to the
  corresponding entry and highlights it
- Pressing **Escape** from a decision table view returns to the DRD overview

### DRD Controls

After evaluation, the DRD control bar appears with:

- **🔀 View DRD** — Navigate back to the DRD view with overlays
- **👁 Hide/Show Overlays** — Toggle evaluation overlays on/off
- **🔄 Reset** — Clear all highlights and overlays

### Zoom Controls

When viewing a DRD:

- **+** / **−** — Zoom in/out
- **⊡** — Fit entire diagram to screen
- **◎** — Zoom to show only evaluated decisions (appears after evaluation)

## Decision Overrides (What-If Analysis)

The **Override** section in the input panel lets you supply fixed output values
for upstream decisions, bypassing their actual evaluation. This is useful for
"what-if" analysis:

1. Expand the **Overrides** section
2. Enter a value for any upstream decision
3. Evaluate — the overridden decision shows an ⚡ icon in the DRD

## Trace Export

Export the evaluation trace for external analysis:

- **📋 JSON** — Full trace with all metadata (inputs, outputs, timing, errors)
- **📋 CSV** — Tabular format for spreadsheet import

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Run evaluation |
| `Escape` | Return to DRD from a decision table view |
| `Tab` | Navigate between DRD overlays (keyboard accessible) |
| `Enter` / `Space` | Activate focused DRD overlay |

## Tips

- **Large diagrams**: Use the zoom controls or `◎` to focus on evaluated decisions
- **Performance**: The timing overlay helps identify bottleneck decisions
- **Debugging**: Click through decisions in evaluation order to trace data flow
- **Comparison**: Use the ⚖️ Compare feature to see how DRG structure changed
  between DMN versions
