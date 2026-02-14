// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mock state (referenced by mock factories via closure) ────

let mockOverlays, mockCanvas, mockElementRegistry, mockActiveViewer, mockInstance;

function resetMocks() {
  mockOverlays = { add: vi.fn(), remove: vi.fn() };
  mockCanvas = { addMarker: vi.fn(), removeMarker: vi.fn() };
  mockElementRegistry = { forEach: vi.fn() };

  mockActiveViewer = {
    get: vi.fn((service) => {
      switch (service) {
        case 'overlays':
          return mockOverlays;
        case 'canvas':
          return mockCanvas;
        case 'elementRegistry':
          return mockElementRegistry;
        default:
          return null;
      }
    }),
  };

  mockInstance = {
    importXML: vi.fn().mockResolvedValue({ warnings: [] }),
    getViews: vi.fn().mockReturnValue([]),
    open: vi.fn().mockResolvedValue(undefined),
    getActiveViewer: vi.fn().mockReturnValue(mockActiveViewer),
    getDefinitions: vi.fn().mockReturnValue({}),
    destroy: vi.fn(),
    saveXML: vi.fn().mockResolvedValue({ xml: '<definitions/>' }),
  };
}

// Initialize before first import
resetMocks();

// ── Mock dmn-js (hoisted by vitest) ────────────────────────────────

vi.mock('dmn-js/lib/Viewer.js', () => ({
  default: vi.fn(function () {
    return mockInstance;
  }),
}));

vi.mock('dmn-js/lib/Modeler.js', () => ({
  default: vi.fn(function () {
    return mockInstance;
  }),
}));

import { createViewer } from '../../src/ui/Viewer.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeTrace(entries) {
  return entries.map((e, i) => ({
    decisionId: `dec${i + 1}`,
    decisionName: `Decision ${i + 1}`,
    type: 'decisionTable',
    result: { output: 'yes' },
    ...e,
  }));
}

function withDrdView() {
  const drdView = { type: 'drd' };
  mockInstance.getViews.mockReturnValue([
    drdView,
    { type: 'decisionTable', element: { id: 'dec1' } },
  ]);
  return drdView;
}

// ── highlightDecisions ──────────────────────────────────────────────

describe('highlightDecisions', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  // --- Guard clauses / edge cases ---

  it('returns immediately for null trace', async () => {
    await ctrl.highlightDecisions(null);
    expect(mockInstance.getViews).not.toHaveBeenCalled();
  });

  it('returns immediately for undefined trace', async () => {
    await ctrl.highlightDecisions(undefined);
    expect(mockInstance.getViews).not.toHaveBeenCalled();
  });

  it('returns immediately for empty trace array', async () => {
    await ctrl.highlightDecisions([]);
    expect(mockInstance.getViews).not.toHaveBeenCalled();
  });

  it('returns without opening when no DRD view exists', async () => {
    mockInstance.getViews.mockReturnValue([{ type: 'decisionTable', element: { id: 'dec1' } }]);
    await ctrl.highlightDecisions(makeTrace([{}]));
    expect(mockInstance.open).not.toHaveBeenCalled();
  });

  it('returns when getActiveViewer() returns null', async () => {
    withDrdView();
    mockInstance.getActiveViewer.mockReturnValue(null);
    await ctrl.highlightDecisions(makeTrace([{}]));
    expect(mockCanvas.addMarker).not.toHaveBeenCalled();
  });

  // --- Successful evaluation highlighting ---

  it('opens the DRD view', async () => {
    const drdView = withDrdView();
    await ctrl.highlightDecisions(makeTrace([{}]));
    expect(mockInstance.open).toHaveBeenCalledWith(drdView);
  });

  it('adds evaluation-order overlay for each trace entry', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    await ctrl.highlightDecisions(trace);

    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    expect(orderCalls).toHaveLength(2);
    expect(orderCalls[0][0]).toBe('a');
    expect(orderCalls[1][0]).toBe('b');
  });

  it('adds evaluation-result overlay for each trace entry', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    await ctrl.highlightDecisions(trace);

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    expect(resultCalls).toHaveLength(2);
  });

  it('marks evaluated decisions with decision-evaluated marker', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-evaluated');
  });

  it('marks error decisions with decision-error marker', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', error: 'fail' }]));
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-error');
  });

  it('marks override decisions with decision-override marker', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', type: 'override' }]));
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-override');
  });

  // --- Error trace entries ---

  it('adds error detail overlay for error entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', error: 'Something broke' }]));

    const errorCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0]).toBe('dec1');
  });

  it('does not add error detail overlay for successful entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    const errorCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-error');
    expect(errorCalls).toHaveLength(0);
  });

  it('error overlay contains the error message text', async () => {
    withDrdView();
    await ctrl.highlightDecisions(
      makeTrace([{ decisionId: 'dec1', error: 'FEEL parse error at col 5' }]),
    );

    const errorCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-error');
    const html = errorCalls[0][2].html;
    expect(html.textContent).toBe('FEEL parse error at col 5');
  });

  // --- Override trace entries ---

  it('adds override class to order badge for override entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', type: 'override' }]));

    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    const html = orderCalls[0][2].html;
    expect(html.classList.contains('override')).toBe(true);
  });

  it('override result overlay has override CSS class', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', type: 'override' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.className).toContain('override');
  });

  // --- Literal expression entries ---

  it('uses literal CSS class for literalExpression type', async () => {
    withDrdView();
    await ctrl.highlightDecisions(
      makeTrace([{ decisionId: 'dec1', type: 'literalExpression', result: 42 }]),
    );

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.className).toContain('literal');
  });

  it('uses 𝑓 icon for literalExpression type', async () => {
    withDrdView();
    await ctrl.highlightDecisions(
      makeTrace([{ decisionId: 'dec1', type: 'literalExpression', result: 42 }]),
    );

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.textContent).toContain('𝑓');
  });

  it('uses ❌ icon for error entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', error: 'fail' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.textContent).toContain('❌');
  });

  it('uses ⚡ icon for override entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', type: 'override' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.textContent).toContain('⚡');
  });

  it('uses ▦ icon for normal decisionTable entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', type: 'decisionTable' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.textContent).toContain('▦');
  });

  // --- Dimming non-evaluated decisions ---

  it('dims non-evaluated decisions in the DRD', async () => {
    withDrdView();
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ type: 'dmn:Decision', id: 'dec1' });
      fn({ type: 'dmn:Decision', id: 'dec2' });
      fn({ type: 'dmn:Decision', id: 'dec3' });
    });

    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec2', 'decision-not-evaluated');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec3', 'decision-not-evaluated');
  });

  it('does not dim evaluated decisions', async () => {
    withDrdView();
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ type: 'dmn:Decision', id: 'dec1' });
    });

    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    expect(mockCanvas.addMarker).not.toHaveBeenCalledWith('dec1', 'decision-not-evaluated');
  });

  it('does not dim non-decision elements', async () => {
    withDrdView();
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ type: 'dmn:InputData', id: 'input1' });
    });

    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    expect(mockCanvas.addMarker).not.toHaveBeenCalledWith('input1', 'decision-not-evaluated');
  });

  // --- Click handler ---

  it('attaches click handler when onDecisionClick is provided', async () => {
    withDrdView();
    const onClick = vi.fn();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]), {
      onDecisionClick: onClick,
    });

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.style.cursor).toBe('pointer');
  });

  it('fires onDecisionClick callback on click', async () => {
    withDrdView();
    const onClick = vi.fn();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    await ctrl.highlightDecisions(trace, { onDecisionClick: onClick });

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    html.click();
    expect(onClick).toHaveBeenCalledWith('dec1', trace[0]);
  });

  it('does not set cursor pointer when no click handler', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.style.cursor).not.toBe('pointer');
  });

  // --- Duration display ---

  it('shows duration when durationMs is present', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', durationMs: 42 }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    const durationSpan = html.querySelector('.decision-duration');
    expect(durationSpan).not.toBeNull();
    expect(durationSpan.textContent).toContain('42ms');
  });

  it('does not show duration when durationMs is absent', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    const durationSpan = html.querySelector('.decision-duration');
    expect(durationSpan).toBeNull();
  });

  // --- Resilience (error handling) ---

  it('continues processing when canvas.addMarker throws', async () => {
    withDrdView();
    mockCanvas.addMarker.mockImplementation(() => {
      throw new Error('Element not found');
    });

    // Should not throw
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }, { decisionId: 'dec2' }]));
  });

  it('handles dimming errors gracefully', async () => {
    withDrdView();
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ type: 'dmn:Decision', id: 'notEvaluated' });
    });
    mockCanvas.addMarker.mockImplementationOnce(() => {
      throw new Error('Marker error');
    });

    // Should not throw
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]));
  });

  // --- Multiple trace entries preserve order ---

  it('adds order badges with sequential numbers', async () => {
    withDrdView();
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'A' },
      { decisionId: 'b', decisionName: 'B' },
      { decisionId: 'c', decisionName: 'C' },
    ]);

    await ctrl.highlightDecisions(trace);

    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    expect(orderCalls).toHaveLength(3);
    expect(orderCalls[0][2].html.textContent).toBe('1');
    expect(orderCalls[1][2].html.textContent).toBe('2');
    expect(orderCalls[2][2].html.textContent).toBe('3');
  });

  // --- Tooltip content ---

  it('includes decision info in tooltip', async () => {
    withDrdView();
    await ctrl.highlightDecisions(
      makeTrace([
        {
          decisionId: 'dec1',
          decisionName: 'My Decision',
          type: 'decisionTable',
          result: { x: 1 },
          inputValues: { age: 25 },
          durationMs: 10,
        },
      ]),
    );

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const title = resultCalls[0][2].html.title;
    expect(title).toContain('My Decision');
    expect(title).toContain('dec1');
    expect(title).toContain('decisionTable');
    expect(title).toContain('age');
    expect(title).toContain('10ms');
  });

  it('includes error in tooltip for error entries', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', error: 'FEEL parse error' }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const title = resultCalls[0][2].html.title;
    expect(title).toContain('FEEL parse error');
  });

  it('omits inputs section when inputValues is empty', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', inputValues: {} }]));

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const title = resultCalls[0][2].html.title;
    expect(title).not.toContain('Inputs:');
  });

  // --- Mixed trace (multiple types in one evaluation) ---

  it('handles mixed trace with table, literal, override, and error entries', async () => {
    withDrdView();
    const trace = makeTrace([
      { decisionId: 'a', type: 'decisionTable', result: [{ out: 1 }] },
      { decisionId: 'b', type: 'literalExpression', result: 42 },
      { decisionId: 'c', type: 'override', result: 'custom' },
      { decisionId: 'd', type: 'decisionTable', error: 'No rule matched' },
    ]);

    await ctrl.highlightDecisions(trace);

    expect(mockCanvas.addMarker).toHaveBeenCalledWith('a', 'decision-evaluated');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('b', 'decision-evaluated');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('c', 'decision-override');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('d', 'decision-error');

    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    expect(orderCalls).toHaveLength(4);

    const errorCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0]).toBe('d');
  });
});

// ── clearDecisionHighlights ─────────────────────────────────────────

describe('clearDecisionHighlights', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('removes all overlay types', () => {
    ctrl.clearDecisionHighlights();

    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'evaluation-order' });
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'evaluation-result' });
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'evaluation-error' });
  });

  it('removes markers from all elements', () => {
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ id: 'dec1' });
      fn({ id: 'dec2' });
    });

    ctrl.clearDecisionHighlights();

    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec1', 'decision-evaluated');
    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec1', 'decision-error');
    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec1', 'decision-override');
    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec1', 'decision-not-evaluated');
    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec2', 'decision-evaluated');
  });

  it('handles null activeViewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.clearDecisionHighlights()).not.toThrow();
  });

  it('handles overlays.remove throwing', () => {
    mockOverlays.remove.mockImplementation(() => {
      throw new Error('No overlays');
    });
    expect(() => ctrl.clearDecisionHighlights()).not.toThrow();
  });

  it('handles removeMarker throwing for individual elements', () => {
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ id: 'dec1' });
    });
    mockCanvas.removeMarker.mockImplementation(() => {
      throw new Error('No marker');
    });
    expect(() => ctrl.clearDecisionHighlights()).not.toThrow();
  });
});

// ── DRD navigation ──────────────────────────────────────────────────

describe('DRD navigation', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('isDrdView returns false when activeViewer is null', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(ctrl.isDrdView()).toBe(false);
  });

  it('isDrdView returns true when canvas is available', () => {
    expect(ctrl.isDrdView()).toBe(true);
  });

  it('isDrdView returns false when canvas throws', () => {
    mockActiveViewer.get.mockImplementation((name) => {
      if (name === 'canvas') throw new Error('Not in DRD mode');
      return null;
    });
    expect(ctrl.isDrdView()).toBe(false);
  });

  it('navigateToDecision opens the matching decision table view', async () => {
    const tableView = { type: 'decisionTable', element: { id: 'dec1' } };
    mockInstance.getViews.mockReturnValue([{ type: 'drd' }, tableView]);

    const result = await ctrl.navigateToDecision('dec1');
    expect(result).toBe(true);
    expect(mockInstance.open).toHaveBeenCalledWith(tableView);
  });

  it('navigateToDecision opens a literal expression view', async () => {
    const litView = { type: 'literalExpression', element: { id: 'lit1' } };
    mockInstance.getViews.mockReturnValue([{ type: 'drd' }, litView]);

    const result = await ctrl.navigateToDecision('lit1');
    expect(result).toBe(true);
    expect(mockInstance.open).toHaveBeenCalledWith(litView);
  });

  it('navigateToDecision returns false for unknown decision', async () => {
    mockInstance.getViews.mockReturnValue([{ type: 'drd' }]);
    const result = await ctrl.navigateToDecision('unknown');
    expect(result).toBe(false);
  });

  it('navigateToDrd opens the DRD view', async () => {
    const drdView = { type: 'drd' };
    mockInstance.getViews.mockReturnValue([drdView]);

    const result = await ctrl.navigateToDrd();
    expect(result).toBe(true);
    expect(mockInstance.open).toHaveBeenCalledWith(drdView);
  });

  it('navigateToDrd returns false when no DRD view', async () => {
    mockInstance.getViews.mockReturnValue([]);
    const result = await ctrl.navigateToDrd();
    expect(result).toBe(false);
  });
});

// ── Edit mode ───────────────────────────────────────────────────────

describe('Viewer edit mode', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('starts in view mode', () => {
    expect(ctrl.isEditMode()).toBe(false);
  });

  it('getCurrentXml returns null before loading', () => {
    expect(ctrl.getCurrentXml()).toBeNull();
  });
});

// ── ARIA accessibility ──────────────────────────────────────────────

describe('ARIA accessibility', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('order badge has role=img and aria-label', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', decisionName: 'My Decision' }]));

    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    const html = orderCalls[0][2].html;
    expect(html.getAttribute('role')).toBe('img');
    expect(html.getAttribute('aria-label')).toContain('step 1');
    expect(html.getAttribute('aria-label')).toContain('My Decision');
  });

  it('result overlay has role=button and tabindex', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1' }]), {
      onDecisionClick: vi.fn(),
    });

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.getAttribute('role')).toBe('button');
    expect(html.getAttribute('tabindex')).toBe('0');
  });

  it('result overlay has descriptive aria-label', async () => {
    withDrdView();
    await ctrl.highlightDecisions(
      makeTrace([{ decisionId: 'dec1', decisionName: 'Tax Rate', result: 0.15 }]),
    );

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    expect(html.getAttribute('aria-label')).toContain('Tax Rate');
    expect(html.getAttribute('aria-label')).toContain('result');
  });

  it('error overlay has role=alert', async () => {
    withDrdView();
    await ctrl.highlightDecisions(makeTrace([{ decisionId: 'dec1', error: 'Something broke' }]));

    const errorCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-error');
    const html = errorCalls[0][2].html;
    expect(html.getAttribute('role')).toBe('alert');
    expect(html.getAttribute('aria-label')).toContain('Something broke');
  });

  it('result overlay responds to Enter key', async () => {
    withDrdView();
    const onClick = vi.fn();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    await ctrl.highlightDecisions(trace, { onDecisionClick: onClick });

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    html.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledWith('dec1', trace[0]);
  });

  it('result overlay responds to Space key', async () => {
    withDrdView();
    const onClick = vi.fn();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    await ctrl.highlightDecisions(trace, { onDecisionClick: onClick });

    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    const html = resultCalls[0][2].html;
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    html.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledWith('dec1', trace[0]);
  });
});

// ── Zoom controls ───────────────────────────────────────────────────

describe('Zoom controls', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    mockCanvas.zoom = vi.fn().mockReturnValue(1.0);
    ctrl = createViewer(document.createElement('div'));
  });

  it('zoomIn increases zoom level', () => {
    ctrl.zoomIn();
    expect(mockCanvas.zoom).toHaveBeenCalledWith(1.2, 'auto');
  });

  it('zoomIn accepts custom step', () => {
    ctrl.zoomIn(0.5);
    expect(mockCanvas.zoom).toHaveBeenCalledWith(1.5, 'auto');
  });

  it('zoomOut decreases zoom level', () => {
    ctrl.zoomOut();
    expect(mockCanvas.zoom).toHaveBeenCalledWith(0.8, 'auto');
  });

  it('zoomOut does not go below 0.1', () => {
    mockCanvas.zoom.mockReturnValue(0.15);
    ctrl.zoomOut(0.2);
    expect(mockCanvas.zoom).toHaveBeenCalledWith(0.1, 'auto');
  });

  it('zoomFit calls zoom with fit-viewport', () => {
    ctrl.zoomFit();
    expect(mockCanvas.zoom).toHaveBeenCalledWith('fit-viewport', 'auto');
  });

  it('zoomIn handles no active viewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.zoomIn()).not.toThrow();
  });

  it('zoomOut handles no active viewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.zoomOut()).not.toThrow();
  });

  it('zoomFit handles no active viewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.zoomFit()).not.toThrow();
  });
});

// ── Zoom to Evaluated ───────────────────────────────────────────────

describe('zoomToEvaluated', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    mockCanvas.zoom = vi.fn().mockReturnValue(1.0);
    mockCanvas.viewbox = vi.fn();
    ctrl = createViewer(document.createElement('div'));
  });

  it('does nothing for null trace', () => {
    ctrl.zoomToEvaluated(null);
    expect(mockCanvas.viewbox).not.toHaveBeenCalled();
  });

  it('does nothing for empty trace', () => {
    ctrl.zoomToEvaluated([]);
    expect(mockCanvas.viewbox).not.toHaveBeenCalled();
  });

  it('does nothing when no active viewer', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.zoomToEvaluated(makeTrace([{ decisionId: 'dec1' }]))).not.toThrow();
  });

  it('sets viewbox to bounding box of evaluated decisions', () => {
    mockElementRegistry.get = vi.fn((id) => {
      if (id === 'a') return { x: 100, y: 50, width: 180, height: 80 };
      if (id === 'b') return { x: 400, y: 200, width: 180, height: 80 };
      return undefined;
    });

    ctrl.zoomToEvaluated(
      makeTrace([
        { decisionId: 'a', decisionName: 'A' },
        { decisionId: 'b', decisionName: 'B' },
      ]),
    );

    expect(mockCanvas.viewbox).toHaveBeenCalledTimes(1);
    const vb = mockCanvas.viewbox.mock.calls[0][0];
    // min x = 100 - 60 padding = 40
    expect(vb.x).toBe(40);
    // min y = 50 - 60 padding = -10
    expect(vb.y).toBe(-10);
    // width = (400 + 180 + 60) - 40 = 600
    expect(vb.width).toBe(600);
    // height = (200 + 80 + 60) - (-10) = 350
    expect(vb.height).toBe(350);
  });

  it('uses default dimensions when element has no width/height', () => {
    mockElementRegistry.get = vi.fn((id) => {
      if (id === 'a') return { x: 0, y: 0 };
      return undefined;
    });

    ctrl.zoomToEvaluated(makeTrace([{ decisionId: 'a' }]));

    expect(mockCanvas.viewbox).toHaveBeenCalledTimes(1);
    const vb = mockCanvas.viewbox.mock.calls[0][0];
    // x: 0 - 60 = -60, maxX: 0 + 180 + 60 = 240
    expect(vb.x).toBe(-60);
    expect(vb.y).toBe(-60);
    expect(vb.width).toBe(300); // 240 - (-60)
    expect(vb.height).toBe(200); // 80 + 120
  });

  it('does nothing when no evaluated elements found in registry', () => {
    mockElementRegistry.get = vi.fn().mockReturnValue(undefined);

    ctrl.zoomToEvaluated(makeTrace([{ decisionId: 'missing' }]));

    expect(mockCanvas.viewbox).not.toHaveBeenCalled();
  });

  it('handles canvas.viewbox throwing gracefully', () => {
    mockElementRegistry.get = vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 50 });
    mockCanvas.viewbox = vi.fn(() => {
      throw new Error('viewbox error');
    });

    expect(() => ctrl.zoomToEvaluated(makeTrace([{ decisionId: 'a' }]))).not.toThrow();
  });

  it('handles single evaluated decision', () => {
    mockElementRegistry.get = vi.fn((id) => {
      if (id === 'dec1') return { x: 200, y: 100, width: 180, height: 80 };
      return undefined;
    });

    ctrl.zoomToEvaluated(makeTrace([{ decisionId: 'dec1' }]));

    expect(mockCanvas.viewbox).toHaveBeenCalledTimes(1);
    const vb = mockCanvas.viewbox.mock.calls[0][0];
    expect(vb.x).toBe(140); // 200 - 60
    expect(vb.y).toBe(40); // 100 - 60
    expect(vb.width).toBe(300); // (200 + 180 + 60) - 140
    expect(vb.height).toBe(200); // (100 + 80 + 60) - 40
  });
});

// ── animateDecisions ────────────────────────────────────────────────

describe('animateDecisions', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    ctrl = createViewer(document.createElement('div'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Guard clauses ---

  it('returns null for null trace', () => {
    const result = ctrl.animateDecisions(null);
    expect(result).toBeNull();
  });

  it('returns null for empty trace', () => {
    const result = ctrl.animateDecisions([]);
    expect(result).toBeNull();
  });

  it('returns null when no DRD view exists', () => {
    mockInstance.getViews.mockReturnValue([{ type: 'decisionTable', element: { id: 'dec1' } }]);
    const result = ctrl.animateDecisions(makeTrace([{}]));
    expect(result).toBeNull();
  });

  // --- Controller returned ---

  it('returns an animation controller object', () => {
    withDrdView();
    const animCtrl = ctrl.animateDecisions(makeTrace([{ decisionId: 'dec1' }]));
    expect(animCtrl).not.toBeNull();
    expect(typeof animCtrl.play).toBe('function');
    expect(typeof animCtrl.pause).toBe('function');
    expect(typeof animCtrl.stepForward).toBe('function');
    expect(typeof animCtrl.finish).toBe('function');
    expect(typeof animCtrl.stop).toBe('function');
    expect(typeof animCtrl.setSpeed).toBe('function');
    expect(typeof animCtrl.getCurrentStep).toBe('function');
    expect(typeof animCtrl.getTotalSteps).toBe('function');
    expect(typeof animCtrl.isPlaying).toBe('function');
  });

  it('starts with step -1 and not playing', () => {
    withDrdView();
    const animCtrl = ctrl.animateDecisions(makeTrace([{ decisionId: 'dec1' }]));
    expect(animCtrl.getCurrentStep()).toBe(-1);
    expect(animCtrl.isPlaying()).toBe(false);
  });

  it('reports correct total steps', () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }, { decisionId: 'c' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    expect(animCtrl.getTotalSteps()).toBe(3);
  });

  // --- Play/pause ---

  it('play sets isPlaying to true', async () => {
    withDrdView();
    const animCtrl = ctrl.animateDecisions(
      makeTrace([{ decisionId: 'dec1' }, { decisionId: 'dec2' }]),
    );
    animCtrl.play();
    // Allow setup promise to resolve
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.isPlaying()).toBe(true);
  });

  it('pause sets isPlaying to false', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(100);
    animCtrl.pause();
    expect(animCtrl.isPlaying()).toBe(false);
  });

  it('play reveals the first step immediately', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1' }, { decisionId: 'dec2' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.play();
    // Wait for setup promise + first step
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.getCurrentStep()).toBe(0);
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-evaluated');
  });

  it('advances to next step after speed interval', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }, { decisionId: 'c' }]);
    const animCtrl = ctrl.animateDecisions(trace, { speed: 500 });
    animCtrl.play();
    // First step
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.getCurrentStep()).toBe(0);
    // Wait for second step (500ms delay + 50ms setup)
    await vi.advanceTimersByTimeAsync(600);
    expect(animCtrl.getCurrentStep()).toBe(1);
  });

  // --- Step forward ---

  it('stepForward reveals one step at a time', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    // Need to wait for setup
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.getCurrentStep()).toBe(0);
    expect(animCtrl.isPlaying()).toBe(false);
  });

  it('stepForward pauses auto-play', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }, { decisionId: 'c' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(100);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.isPlaying()).toBe(false);
  });

  // --- Finish ---

  it('finish reveals all remaining steps', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }, { decisionId: 'c' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.finish();
    await vi.advanceTimersByTimeAsync(200);
    expect(animCtrl.getCurrentStep()).toBe(2);
  });

  // --- Stop ---

  it('stop prevents further steps', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stop();
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(200);
    expect(animCtrl.getCurrentStep()).toBe(-1);
  });

  // --- Speed control ---

  it('setSpeed changes the animation interval', async () => {
    withDrdView();
    const animCtrl = ctrl.animateDecisions(makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]));
    animCtrl.setSpeed(200);
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(animCtrl.getCurrentStep()).toBe(0);
    // With speed 200, should advance after ~200ms
    await vi.advanceTimersByTimeAsync(300);
    expect(animCtrl.getCurrentStep()).toBe(1);
  });

  // --- Callbacks ---

  it('calls onStep callback for each step', async () => {
    withDrdView();
    const onStep = vi.fn();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    const animCtrl = ctrl.animateDecisions(trace, { onStep, speed: 100 });
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(onStep).toHaveBeenCalledWith(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('calls onComplete when animation finishes', async () => {
    withDrdView();
    const onComplete = vi.fn();
    const trace = makeTrace([{ decisionId: 'a' }]);
    const animCtrl = ctrl.animateDecisions(trace, { onComplete, speed: 100 });
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // --- Overlay content ---

  it('adds correct markers for evaluated decisions during animation', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-evaluated');
  });

  it('adds error marker for error entries during animation', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1', error: 'fail' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-error');
  });

  it('adds override marker for override entries during animation', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1', type: 'override' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-override');
  });

  it('dims all decisions initially', async () => {
    withDrdView();
    mockElementRegistry.forEach.mockImplementation((fn) => {
      fn({ type: 'dmn:Decision', id: 'dec1' });
      fn({ type: 'dmn:Decision', id: 'dec2' });
    });
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'decision-not-evaluated');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec2', 'decision-not-evaluated');
  });

  it('removes dim marker when revealing a step', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    expect(mockCanvas.removeMarker).toHaveBeenCalledWith('dec1', 'decision-not-evaluated');
  });

  it('adds order badge overlay during animation', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    const orderCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-order');
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0][2].html.textContent).toBe('1');
  });

  it('adds result overlay during animation', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'dec1' }]);
    const animCtrl = ctrl.animateDecisions(trace);
    animCtrl.stepForward();
    await vi.advanceTimersByTimeAsync(100);
    const resultCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'evaluation-result');
    expect(resultCalls).toHaveLength(1);
  });

  it('does not advance after stop', async () => {
    withDrdView();
    const trace = makeTrace([{ decisionId: 'a' }, { decisionId: 'b' }]);
    const animCtrl = ctrl.animateDecisions(trace, { speed: 100 });
    animCtrl.play();
    await vi.advanceTimersByTimeAsync(50);
    animCtrl.stop();
    await vi.advanceTimersByTimeAsync(500);
    // Should not have advanced beyond whatever was in-flight
    expect(animCtrl.isPlaying()).toBe(false);
  });
});
