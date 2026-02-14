// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
