import { describe, it, expect } from 'vitest';

import { createBlankDmn } from '../../src/ui/blank-dmn.js';
import { parseDmnXml } from '../../src/parser/parse.js';

describe('createBlankDmn', () => {
  it('returns valid DMN 1.3 XML', async () => {
    const xml = createBlankDmn();
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('https://www.omg.org/spec/DMN/20191111/MODEL/');
  });

  it('is parseable by the DMN parser', async () => {
    const xml = createBlankDmn();
    const model = await parseDmnXml(xml);

    expect(model).toBeDefined();
    expect(model.decisions.size).toBe(1);
  });

  it('creates a decision with default name', async () => {
    const xml = createBlankDmn();
    const model = await parseDmnXml(xml);

    const decision = model.decisions.values().next().value;
    expect(decision.name).toBe('Decision');
  });

  it('creates a decision table with UNIQUE hit policy', async () => {
    const xml = createBlankDmn();
    const model = await parseDmnXml(xml);

    const decision = model.decisions.values().next().value;
    expect(decision.logic.type).toBe('decisionTable');
    expect(decision.logic.hitPolicy).toBe('UNIQUE');
  });

  it('creates a decision table with one input and one output', async () => {
    const xml = createBlankDmn();
    const model = await parseDmnXml(xml);

    const decision = model.decisions.values().next().value;
    expect(decision.logic.inputs).toHaveLength(1);
    expect(decision.logic.outputs).toHaveLength(1);
    expect(decision.logic.rules).toHaveLength(1);
  });

  it('respects custom definitions name', async () => {
    const xml = createBlankDmn({ definitionsName: 'My Custom Model' });
    const model = await parseDmnXml(xml);

    expect(model.name).toBe('My Custom Model');
  });

  it('respects custom decision name', async () => {
    const xml = createBlankDmn({ decisionName: 'Eligibility Check' });
    const model = await parseDmnXml(xml);

    const decision = model.decisions.values().next().value;
    expect(decision.name).toBe('Eligibility Check');
  });

  it('generates unique IDs across multiple calls', () => {
    const xml1 = createBlankDmn();
    const xml2 = createBlankDmn();

    // Extract the definitions id from each
    const id1 = xml1.match(/id="definitions_(\w+)"/)[1];
    const id2 = xml2.match(/id="definitions_(\w+)"/)[1];

    expect(id1).not.toBe(id2);
  });

  it('escapes special XML characters in names', async () => {
    const xml = createBlankDmn({
      definitionsName: 'Test & <Model>',
      decisionName: 'A "quoted" decision',
    });
    const model = await parseDmnXml(xml);

    expect(model.name).toBe('Test & <Model>');

    const decision = model.decisions.values().next().value;
    expect(decision.name).toBe('A "quoted" decision');
  });

  it('includes DMNDI diagram information', () => {
    const xml = createBlankDmn();
    expect(xml).toContain('dmndi:DMNDI');
    expect(xml).toContain('dmndi:DMNDiagram');
    expect(xml).toContain('dmndi:DMNShape');
  });

  it('produces evaluable decision table', async () => {
    const { evaluateDecision } = await import('../../src/engine/evaluate.js');
    const xml = createBlankDmn();
    const model = await parseDmnXml(xml);
    const decisionId = model.decisions.keys().next().value;

    const { result, error } = evaluateDecision(model, decisionId, { input: 'test' });

    // The wildcard rule ("-") should match any input
    expect(error).toBeUndefined();
    expect(result).toBe('result');
  });
});
