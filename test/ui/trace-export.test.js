import { describe, it, expect } from 'vitest';
import { traceToJson, traceToCSV } from '../../src/ui/trace-export.js';

// ── Test Fixtures ───────────────────────────────────────────────────

function makeTrace() {
  return [
    {
      decisionId: 'eligibility',
      decisionName: 'Eligibility',
      type: 'decisionTable',
      hitPolicy: 'UNIQUE',
      inputValues: { age: 25, income: 50000 },
      matchedRules: [{ index: 1, id: 'rule_2', outputs: { eligible: true } }],
      result: { eligible: true },
      durationMs: 3.2,
    },
    {
      decisionId: 'discount',
      decisionName: 'Discount',
      type: 'literalExpression',
      inputValues: { eligible: true },
      matchedRules: [],
      result: 0.1,
      durationMs: 1.1,
    },
  ];
}

function makeErrorTrace() {
  return [
    {
      decisionId: 'broken',
      decisionName: 'Broken Decision',
      type: 'decisionTable',
      hitPolicy: 'UNIQUE',
      inputValues: { x: 1 },
      matchedRules: [
        { index: 0, id: 'r1', outputs: { out: 'a' } },
        { index: 2, id: 'r3', outputs: { out: 'b' } },
      ],
      result: null,
      error: 'UNIQUE hit policy violated: 2 rules matched',
    },
  ];
}

// ── traceToJson ─────────────────────────────────────────────────────

describe('traceToJson', () => {
  it('serializes a basic trace with metadata', () => {
    const json = traceToJson(makeTrace(), { decisionId: 'discount' });
    const parsed = JSON.parse(json);

    expect(parsed.decisionId).toBe('discount');
    expect(parsed.totalSteps).toBe(2);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.trace).toHaveLength(2);
  });

  it('includes step numbers starting from 1', () => {
    const parsed = JSON.parse(traceToJson(makeTrace()));
    expect(parsed.trace[0].step).toBe(1);
    expect(parsed.trace[1].step).toBe(2);
  });

  it('preserves decision details', () => {
    const parsed = JSON.parse(traceToJson(makeTrace()));
    const first = parsed.trace[0];

    expect(first.decisionId).toBe('eligibility');
    expect(first.decisionName).toBe('Eligibility');
    expect(first.type).toBe('decisionTable');
    expect(first.hitPolicy).toBe('UNIQUE');
    expect(first.inputValues).toEqual({ age: 25, income: 50000 });
    expect(first.result).toEqual({ eligible: true });
    expect(first.durationMs).toBe(3.2);
  });

  it('includes matched rule details', () => {
    const parsed = JSON.parse(traceToJson(makeTrace()));
    const rules = parsed.trace[0].matchedRules;

    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ index: 1, id: 'rule_2', outputs: { eligible: true } });
  });

  it('includes error information', () => {
    const parsed = JSON.parse(traceToJson(makeErrorTrace()));
    expect(parsed.trace[0].error).toBe('UNIQUE hit policy violated: 2 rules matched');
  });

  it('omits optional fields when not present', () => {
    const trace = [
      {
        decisionId: 'simple',
        decisionName: 'Simple',
        type: 'decisionTable',
        inputValues: {},
        matchedRules: [],
        result: null,
      },
    ];

    const parsed = JSON.parse(traceToJson(trace));
    expect(parsed.trace[0]).not.toHaveProperty('hitPolicy');
    expect(parsed.trace[0]).not.toHaveProperty('aggregation');
    expect(parsed.trace[0]).not.toHaveProperty('durationMs');
    expect(parsed.trace[0]).not.toHaveProperty('error');
  });

  it('omits decisionId from top level when not provided', () => {
    const parsed = JSON.parse(traceToJson(makeTrace()));
    expect(parsed).not.toHaveProperty('decisionId');
  });

  it('handles empty trace', () => {
    const parsed = JSON.parse(traceToJson([]));
    expect(parsed.totalSteps).toBe(0);
    expect(parsed.trace).toEqual([]);
  });
});

// ── traceToCSV ──────────────────────────────────────────────────────

describe('traceToCSV', () => {
  it('generates header row', () => {
    const csv = traceToCSV(makeTrace());
    const header = csv.split('\n')[0];

    expect(header).toContain('step');
    expect(header).toContain('decisionId');
    expect(header).toContain('decisionName');
    expect(header).toContain('type');
    expect(header).toContain('hitPolicy');
    expect(header).toContain('result');
    expect(header).toContain('error');
  });

  it('generates one data row per trace entry', () => {
    const csv = traceToCSV(makeTrace());
    const lines = csv.split('\n');

    // 1 header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it('includes step numbers', () => {
    const csv = traceToCSV(makeTrace());
    const lines = csv.split('\n');

    expect(lines[1]).toMatch(/^1,/);
    expect(lines[2]).toMatch(/^2,/);
  });

  it('escapes values containing commas', () => {
    const trace = [
      {
        decisionId: 'test',
        decisionName: 'Test, with comma',
        type: 'decisionTable',
        inputValues: { a: 1 },
        matchedRules: [],
        result: { x: 1, y: 2 },
      },
    ];

    const csv = traceToCSV(trace);
    // Name with comma should be quoted
    expect(csv).toContain('"Test, with comma"');
  });

  it('escapes values containing quotes', () => {
    const trace = [
      {
        decisionId: 'test',
        decisionName: 'Test "quoted"',
        type: 'decisionTable',
        inputValues: {},
        matchedRules: [],
        result: null,
      },
    ];

    const csv = traceToCSV(trace);
    expect(csv).toContain('"Test ""quoted"""');
  });

  it('includes matched rule count and indices', () => {
    const csv = traceToCSV(makeErrorTrace());
    const dataRow = csv.split('\n')[1];

    // 2 matched rules
    expect(dataRow).toContain(',2,');
    // Rule indices (1-based): 1;3
    expect(dataRow).toContain('1;3');
  });

  it('handles empty trace', () => {
    const csv = traceToCSV([]);
    const lines = csv.split('\n');

    // Just the header
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('step');
  });

  it('handles trace entries with missing optional fields', () => {
    const trace = [
      {
        decisionId: 'min',
        decisionName: 'Minimal',
        type: 'override',
        inputValues: {},
        matchedRules: [],
        result: 42,
      },
    ];

    const csv = traceToCSV(trace);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    // Should not throw
    expect(lines[1]).toContain('min');
  });
});
