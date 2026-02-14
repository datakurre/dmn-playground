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

vi.mock('diagram-js-minimap', () => ({
  default: {
    __init__: ['minimap'],
    minimap: ['type', class MockMinimap {}],
  },
}));

vi.mock('diagram-js-minimap/assets/diagram-js-minimap.css', () => ({}));

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

// ── showDataFlow ────────────────────────────────────────────────────

describe('showDataFlow', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  function makeModel(decisions) {
    const map = new Map();
    for (const d of decisions) {
      map.set(d.id, {
        id: d.id,
        name: d.name || d.id,
        informationRequirements: d.requires || [],
        logic: { type: 'decisionTable' },
      });
    }
    return { id: 'model', name: 'Test', namespace: '', decisions: map };
  }

  function withConnection(sourceId, targetId, connectionId) {
    const conn = {
      id: connectionId || `${sourceId}_${targetId}`,
      type: 'dmn:InformationRequirement',
      source: { id: sourceId },
      target: { id: targetId },
    };
    const original = mockElementRegistry.forEach;
    mockElementRegistry.forEach = vi.fn((fn) => {
      if (original.getMockImplementation()) {
        original.getMockImplementation()(fn);
      }
      fn(conn);
    });
    return conn;
  }

  // --- Guard clauses ---

  it('returns for null trace', () => {
    ctrl.showDataFlow(null, makeModel([]));
    expect(mockOverlays.add).not.toHaveBeenCalled();
  });

  it('returns for empty trace', () => {
    ctrl.showDataFlow([], makeModel([]));
    expect(mockOverlays.add).not.toHaveBeenCalled();
  });

  it('returns for null model', () => {
    ctrl.showDataFlow(makeTrace([{ decisionId: 'a' }]), null);
    expect(mockOverlays.add).not.toHaveBeenCalled();
  });

  it('returns when no active viewer', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    const model = makeModel([{ id: 'a' }]);
    ctrl.showDataFlow(makeTrace([{ decisionId: 'a' }]), model);
    expect(mockOverlays.add).not.toHaveBeenCalled();
  });

  it('returns when overlays service throws', () => {
    mockActiveViewer.get.mockImplementation((name) => {
      if (name === 'overlays') throw new Error('No overlays');
      return mockElementRegistry;
    });
    const model = makeModel([{ id: 'a' }]);
    expect(() => ctrl.showDataFlow(makeTrace([{ decisionId: 'a' }]), model)).not.toThrow();
  });

  // --- Data flow overlay creation ---

  it('adds data-flow overlay on connection between decisions', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([
      { id: 'a', name: 'Decision A' },
      { id: 'b', name: 'Decision B', requires: ['a'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'Decision A', result: 42 },
      { decisionId: 'b', decisionName: 'Decision B', result: 'yes' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(1);
    expect(flowCalls[0][0]).toBe('conn_ab');
  });

  it('label shows the result value from the source decision', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([
      { id: 'a', name: 'Decision A' },
      { id: 'b', name: 'Decision B', requires: ['a'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'Decision A', result: 42 },
      { decisionId: 'b', decisionName: 'Decision B', result: 'yes' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    expect(html.textContent).toBe('42');
  });

  it('label has data-flow-label CSS class', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 'test' },
      { decisionId: 'b', result: 'out' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    expect(html.className).toBe('data-flow-label');
  });

  it('label has ARIA attributes', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([
      { id: 'a', name: 'Decision A' },
      { id: 'b', name: 'Decision B', requires: ['a'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'Decision A', result: 42 },
      { decisionId: 'b', decisionName: 'Decision B', result: 'yes' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    expect(html.getAttribute('role')).toBe('img');
    expect(html.getAttribute('aria-label')).toContain('Decision A');
    expect(html.getAttribute('aria-label')).toContain('Decision B');
  });

  it('label has tooltip with full detail', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([
      { id: 'a', name: 'Decision A' },
      { id: 'b', name: 'Decision B', requires: ['a'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'Decision A', result: { rating: 'A+' } },
      { decisionId: 'b', decisionName: 'Decision B', result: 'yes' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    expect(html.title).toContain('Decision A');
    expect(html.title).toContain('Decision B');
    expect(html.title).toContain('rating');
  });

  it('does not add overlay when connection is not found', () => {
    // No connection registered
    mockElementRegistry.forEach = vi.fn(() => {});
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 42 },
      { decisionId: 'b', result: 'yes' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(0);
  });

  it('does not add overlay when required decision is not in trace', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    // Only 'b' is in the trace, not 'a'
    const trace = makeTrace([{ decisionId: 'b', result: 'yes' }]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(0);
  });

  it('handles multiple connections in a chain', () => {
    // a -> b -> c
    const connAB = {
      id: 'conn_ab',
      type: 'dmn:InformationRequirement',
      source: { id: 'a' },
      target: { id: 'b' },
    };
    const connBC = {
      id: 'conn_bc',
      type: 'dmn:InformationRequirement',
      source: { id: 'b' },
      target: { id: 'c' },
    };
    mockElementRegistry.forEach = vi.fn((fn) => {
      fn(connAB);
      fn(connBC);
    });

    const model = makeModel([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', requires: ['a'] },
      { id: 'c', name: 'C', requires: ['b'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'A', result: 10 },
      { decisionId: 'b', decisionName: 'B', result: 20 },
      { decisionId: 'c', decisionName: 'C', result: 30 },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(2);
    expect(flowCalls[0][0]).toBe('conn_ab');
    expect(flowCalls[1][0]).toBe('conn_bc');
  });

  it('handles diamond dependency pattern', () => {
    // a -> c, b -> c
    const connAC = {
      id: 'conn_ac',
      type: 'dmn:InformationRequirement',
      source: { id: 'a' },
      target: { id: 'c' },
    };
    const connBC = {
      id: 'conn_bc',
      type: 'dmn:InformationRequirement',
      source: { id: 'b' },
      target: { id: 'c' },
    };
    mockElementRegistry.forEach = vi.fn((fn) => {
      fn(connAC);
      fn(connBC);
    });

    const model = makeModel([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', requires: ['a', 'b'] },
    ]);
    const trace = makeTrace([
      { decisionId: 'a', decisionName: 'A', result: 1 },
      { decisionId: 'b', decisionName: 'B', result: 2 },
      { decisionId: 'c', decisionName: 'C', result: 3 },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(2);
  });

  it('clears previous data-flow overlays before adding new ones', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 1 },
      { decisionId: 'b', result: 2 },
    ]);

    ctrl.showDataFlow(trace, model);

    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'data-flow' });
  });

  it('handles overlays.add throwing gracefully', () => {
    withConnection('a', 'b', 'conn_ab');
    mockOverlays.add.mockImplementation(() => {
      throw new Error('Cannot add overlay');
    });
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 1 },
      { decisionId: 'b', result: 2 },
    ]);

    expect(() => ctrl.showDataFlow(trace, model)).not.toThrow();
  });

  it('calls onConnectionHover on mouseenter', () => {
    withConnection('a', 'b', 'conn_ab');
    const onHover = vi.fn();
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 1 },
      { decisionId: 'b', result: 2 },
    ]);

    ctrl.showDataFlow(trace, model, { onConnectionHover: onHover });

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    html.dispatchEvent(new Event('mouseenter'));
    expect(onHover).toHaveBeenCalledWith('a', 'b', true);
  });

  it('calls onConnectionHover on mouseleave', () => {
    withConnection('a', 'b', 'conn_ab');
    const onHover = vi.fn();
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: 1 },
      { decisionId: 'b', result: 2 },
    ]);

    ctrl.showDataFlow(trace, model, { onConnectionHover: onHover });

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    html.dispatchEvent(new Event('mouseleave'));
    expect(onHover).toHaveBeenCalledWith('a', 'b', false);
  });

  it('shows null result as ∅', () => {
    withConnection('a', 'b', 'conn_ab');
    const model = makeModel([{ id: 'a' }, { id: 'b', requires: ['a'] }]);
    const trace = makeTrace([
      { decisionId: 'a', result: null },
      { decisionId: 'b', result: 'out' },
    ]);

    ctrl.showDataFlow(trace, model);

    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    const html = flowCalls[0][2].html;
    expect(html.textContent).toBe('∅');
  });

  it('skips decisions not in the model', () => {
    const model = makeModel([
      { id: 'a' },
      // 'b' is NOT in the model
    ]);
    const trace = makeTrace([
      { decisionId: 'a', result: 1 },
      { decisionId: 'b', result: 2 },
    ]);

    expect(() => ctrl.showDataFlow(trace, model)).not.toThrow();
    const flowCalls = mockOverlays.add.mock.calls.filter((c) => c[1] === 'data-flow');
    expect(flowCalls).toHaveLength(0);
  });
});

// ── clearDataFlow ───────────────────────────────────────────────────

describe('clearDataFlow', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('removes data-flow overlay type', () => {
    ctrl.clearDataFlow();
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'data-flow' });
  });

  it('handles null activeViewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.clearDataFlow()).not.toThrow();
  });

  it('handles overlays.remove throwing', () => {
    mockOverlays.remove.mockImplementation(() => {
      throw new Error('No overlays');
    });
    expect(() => ctrl.clearDataFlow()).not.toThrow();
  });
});

// ── clearDecisionHighlights also clears data-flow ───────────────────

describe('clearDecisionHighlights data-flow cleanup', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('removes data-flow overlays along with other overlay types', () => {
    ctrl.clearDecisionHighlights();
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'data-flow' });
  });
});

// ── Minimap ─────────────────────────────────────────────────────────

describe('toggleMinimap', () => {
  let ctrl;
  let mockMinimap;

  beforeEach(() => {
    resetMocks();
    mockMinimap = {
      toggle: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false),
    };
    mockActiveViewer.get.mockImplementation((service) => {
      switch (service) {
        case 'overlays':
          return mockOverlays;
        case 'canvas':
          return mockCanvas;
        case 'elementRegistry':
          return mockElementRegistry;
        case 'minimap':
          return mockMinimap;
        default:
          return null;
      }
    });
    ctrl = createViewer(document.createElement('div'));
  });

  it('toggles minimap when called with no argument', () => {
    ctrl.toggleMinimap();
    expect(mockMinimap.toggle).toHaveBeenCalled();
  });

  it('opens minimap when called with true', () => {
    ctrl.toggleMinimap(true);
    expect(mockMinimap.open).toHaveBeenCalled();
  });

  it('closes minimap when called with false', () => {
    ctrl.toggleMinimap(false);
    expect(mockMinimap.close).toHaveBeenCalled();
  });

  it('handles null activeViewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.toggleMinimap()).not.toThrow();
  });

  it('handles minimap not available gracefully', () => {
    mockActiveViewer.get.mockImplementation((service) => {
      if (service === 'minimap') throw new Error('No minimap');
      return mockOverlays;
    });
    expect(() => ctrl.toggleMinimap()).not.toThrow();
  });
});

describe('isMinimapOpen', () => {
  let ctrl;
  let mockMinimap;

  beforeEach(() => {
    resetMocks();
    mockMinimap = {
      toggle: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn().mockReturnValue(true),
    };
    mockActiveViewer.get.mockImplementation((service) => {
      switch (service) {
        case 'minimap':
          return mockMinimap;
        default:
          return null;
      }
    });
    ctrl = createViewer(document.createElement('div'));
  });

  it('returns true when minimap is open', () => {
    expect(ctrl.isMinimapOpen()).toBe(true);
  });

  it('returns false when minimap is closed', () => {
    mockMinimap.isOpen.mockReturnValue(false);
    expect(ctrl.isMinimapOpen()).toBe(false);
  });

  it('returns false when activeViewer is null', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(ctrl.isMinimapOpen()).toBe(false);
  });

  it('returns false when minimap service is unavailable', () => {
    mockActiveViewer.get.mockImplementation(() => {
      throw new Error('No minimap');
    });
    expect(ctrl.isMinimapOpen()).toBe(false);
  });
});

// ── highlightComparison ─────────────────────────────────────────────

describe('highlightComparison', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('returns immediately for null diff', async () => {
    await ctrl.highlightComparison(null);
    expect(mockInstance.getViews).not.toHaveBeenCalled();
  });

  it('returns immediately for empty decisions', async () => {
    await ctrl.highlightComparison({ decisions: [], summary: {} });
    expect(mockInstance.getViews).not.toHaveBeenCalled();
  });

  it('returns when no DRD view is available', async () => {
    mockInstance.getViews.mockReturnValue([{ type: 'decisionTable' }]);
    const diff = {
      decisions: [{ id: 'dec1', name: 'D1', status: 'modified', changes: [] }],
      summary: { modified: 1, added: 0, removed: 0, unchanged: 0 },
    };
    await ctrl.highlightComparison(diff);
    expect(mockInstance.open).not.toHaveBeenCalled();
  });

  it('adds marker and badge overlay for each decision in the diff', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockReturnValue({ id: 'dec1' });

    const diff = {
      decisions: [{ id: 'dec1', name: 'Decision 1', status: 'modified', changes: [] }],
      summary: { modified: 1, added: 0, removed: 0, unchanged: 0 },
    };

    await ctrl.highlightComparison(diff);

    // Adds the CSS marker
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'compare-modified');

    // Adds the badge overlay
    expect(mockOverlays.add).toHaveBeenCalledWith(
      'dec1',
      'comparison-badge',
      expect.objectContaining({
        position: { top: -14, right: -14 },
      }),
    );
  });

  it('adds detail overlay for modified decisions with changes', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockReturnValue({ id: 'dec1' });

    const diff = {
      decisions: [
        {
          id: 'dec1',
          name: 'Decision 1',
          status: 'modified',
          changes: [{ field: 'hitPolicy', left: 'UNIQUE', right: 'FIRST' }],
          ruleDiffs: [{ status: 'modified' }],
        },
      ],
      summary: { modified: 1, added: 0, removed: 0, unchanged: 0 },
    };

    await ctrl.highlightComparison(diff);

    // Should have badge overlay and detail overlay
    const addCalls = mockOverlays.add.mock.calls;
    expect(addCalls.some((c) => c[1] === 'comparison-badge')).toBe(true);
    expect(addCalls.some((c) => c[1] === 'comparison-detail')).toBe(true);
  });

  it('handles added and removed decisions', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockImplementation((id) => {
      if (id === 'dec1') return { id: 'dec1' };
      if (id === 'dec2') return { id: 'dec2' };
      return null;
    });

    const diff = {
      decisions: [
        { id: 'dec1', name: 'Added', status: 'added', changes: [] },
        { id: 'dec2', name: 'Removed', status: 'removed', changes: [] },
      ],
      summary: { added: 1, removed: 1, modified: 0, unchanged: 0 },
    };

    await ctrl.highlightComparison(diff);

    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec1', 'compare-added');
    expect(mockCanvas.addMarker).toHaveBeenCalledWith('dec2', 'compare-removed');
  });

  it('skips decisions not found in the element registry', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockReturnValue(null);

    const diff = {
      decisions: [{ id: 'missing', name: 'Missing', status: 'added', changes: [] }],
      summary: { added: 1, removed: 0, modified: 0, unchanged: 0 },
    };

    await ctrl.highlightComparison(diff);

    expect(mockCanvas.addMarker).not.toHaveBeenCalled();
    expect(mockOverlays.add).not.toHaveBeenCalled();
  });

  it('calls onDecisionClick when detail overlay is clicked', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockReturnValue({ id: 'dec1' });

    const onClick = vi.fn();
    const diff = {
      decisions: [
        {
          id: 'dec1',
          name: 'D1',
          status: 'modified',
          changes: [{ field: 'hitPolicy', left: 'UNIQUE', right: 'FIRST' }],
        },
      ],
      summary: { modified: 1, added: 0, removed: 0, unchanged: 0 },
    };

    await ctrl.highlightComparison(diff, { onDecisionClick: onClick });

    // Find the detail overlay call
    const detailCall = mockOverlays.add.mock.calls.find((c) => c[1] === 'comparison-detail');
    expect(detailCall).toBeDefined();

    // Simulate click on the detail HTML
    const detailHtml = detailCall[2].html;
    detailHtml.click();
    expect(onClick).toHaveBeenCalledWith('dec1', diff.decisions[0]);
  });

  it('handles canvas.addMarker throwing', async () => {
    withDrdView();
    mockElementRegistry.get = vi.fn().mockReturnValue({ id: 'dec1' });
    mockCanvas.addMarker.mockImplementation(() => {
      throw new Error('marker error');
    });

    const diff = {
      decisions: [{ id: 'dec1', name: 'D1', status: 'modified', changes: [] }],
      summary: { modified: 1, added: 0, removed: 0, unchanged: 0 },
    };

    await expect(ctrl.highlightComparison(diff)).resolves.toBeUndefined();
  });
});

// ── clearComparisonHighlights ───────────────────────────────────────

describe('clearComparisonHighlights', () => {
  let ctrl;

  beforeEach(() => {
    resetMocks();
    ctrl = createViewer(document.createElement('div'));
  });

  it('removes comparison-badge and comparison-detail overlay types', () => {
    ctrl.clearComparisonHighlights();
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'comparison-badge' });
    expect(mockOverlays.remove).toHaveBeenCalledWith({ type: 'comparison-detail' });
  });

  it('removes comparison markers from all elements', () => {
    const elements = [{ id: 'dec1' }, { id: 'dec2' }];
    mockElementRegistry.forEach.mockImplementation((fn) => elements.forEach(fn));

    ctrl.clearComparisonHighlights();

    for (const el of elements) {
      expect(mockCanvas.removeMarker).toHaveBeenCalledWith(el.id, 'compare-added');
      expect(mockCanvas.removeMarker).toHaveBeenCalledWith(el.id, 'compare-removed');
      expect(mockCanvas.removeMarker).toHaveBeenCalledWith(el.id, 'compare-modified');
      expect(mockCanvas.removeMarker).toHaveBeenCalledWith(el.id, 'compare-unchanged');
    }
  });

  it('handles null activeViewer gracefully', () => {
    mockInstance.getActiveViewer.mockReturnValue(null);
    expect(() => ctrl.clearComparisonHighlights()).not.toThrow();
  });

  it('handles overlays.remove throwing', () => {
    mockOverlays.remove.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(() => ctrl.clearComparisonHighlights()).not.toThrow();
  });
});
