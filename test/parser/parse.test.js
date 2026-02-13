import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

describe('DMN Parser', () => {
  it('parses a simple decision table', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model = await parseDmnXml(xml);

    expect(model.id).toBe('definitions_simple');
    expect(model.decisions.size).toBe(1);

    const decision = model.decisions.get('decision_age');
    expect(decision).toBeDefined();
    expect(decision.name).toBe('Age Category');
    expect(decision.logic.type).toBe('decisionTable');
    expect(decision.logic.hitPolicy).toBe('UNIQUE');
    expect(decision.logic.inputs).toHaveLength(1);
    expect(decision.logic.inputs[0].expression).toBe('age');
    expect(decision.logic.outputs).toHaveLength(1);
    expect(decision.logic.outputs[0].name).toBe('category');
    expect(decision.logic.rules).toHaveLength(3);
  });

  it('parses hit policy and aggregation', async () => {
    const xml = loadFixture('collect-sum-decision.dmn');
    const model = await parseDmnXml(xml);

    const decision = model.decisions.get('decision_discount');
    expect(decision.logic.hitPolicy).toBe('COLLECT');
    expect(decision.logic.aggregation).toBe('SUM');
    expect(decision.logic.inputs).toHaveLength(2);
    expect(decision.logic.outputs).toHaveLength(1);
    expect(decision.logic.rules).toHaveLength(3);
  });

  it('parses information requirements (DRG)', async () => {
    const xml = loadFixture('drg-decision.dmn');
    const model = await parseDmnXml(xml);

    expect(model.decisions.size).toBe(2);

    const riskDecision = model.decisions.get('decision_risk');
    expect(riskDecision.informationRequirements).toHaveLength(0);

    const rateDecision = model.decisions.get('decision_rate');
    expect(rateDecision.informationRequirements).toEqual(['decision_risk']);
  });

  it('parses literal expressions', async () => {
    const xml = loadFixture('literal-expression.dmn');
    const model = await parseDmnXml(xml);

    const decision = model.decisions.get('decision_calc');
    expect(decision.logic.type).toBe('literalExpression');
    expect(decision.logic.expression).toBe('price * quantity * (1 - discountRate)');
  });

  it('extracts rule input/output entries', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model = await parseDmnXml(xml);

    const rules = model.decisions.get('decision_age').logic.rules;
    expect(rules[0].inputEntries).toEqual(['< 13']);
    expect(rules[0].outputEntries).toEqual(['"child"']);
    expect(rules[2].inputEntries).toEqual(['>= 18']);
    expect(rules[2].outputEntries).toEqual(['"adult"']);
  });
});
