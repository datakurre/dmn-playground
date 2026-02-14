import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { compareModels } from '../../src/engine/compare.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

describe('compareModels', () => {
  it('reports no changes when comparing a model to itself', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model = await parseDmnXml(xml);

    const diff = compareModels(model, model);

    expect(diff.summary.unchanged).toBe(model.decisions.size);
    expect(diff.summary.added).toBe(0);
    expect(diff.summary.removed).toBe(0);
    expect(diff.summary.modified).toBe(0);
  });

  it('detects an added decision', async () => {
    const simpleXml = loadFixture('simple-decision.dmn');
    const drgXml = loadFixture('drg-decision.dmn');

    const simpleModel = await parseDmnXml(simpleXml);
    const drgModel = await parseDmnXml(drgXml);

    // drg-decision has more decisions than simple-decision
    const diff = compareModels(simpleModel, drgModel);

    expect(diff.summary.added).toBeGreaterThan(0);
    const addedDecisions = diff.decisions.filter((d) => d.status === 'added');
    expect(addedDecisions.length).toBeGreaterThan(0);
    for (const d of addedDecisions) {
      expect(d.status).toBe('added');
      expect(d.name).toBeTruthy();
    }
  });

  it('detects a removed decision', async () => {
    const simpleXml = loadFixture('simple-decision.dmn');
    const drgXml = loadFixture('drg-decision.dmn');

    const simpleModel = await parseDmnXml(simpleXml);
    const drgModel = await parseDmnXml(drgXml);

    // Reverse: drg has extra decisions, so comparing drg→simple means removed
    const diff = compareModels(drgModel, simpleModel);

    expect(diff.summary.removed).toBeGreaterThan(0);
    const removedDecisions = diff.decisions.filter((d) => d.status === 'removed');
    expect(removedDecisions.length).toBeGreaterThan(0);
  });

  it('detects modified rules in a decision table', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);

    // Deep-clone and modify a rule
    const model2 = await parseDmnXml(xml);
    const decision = model2.decisions.values().next().value;
    if (decision.logic?.type === 'decisionTable' && decision.logic.rules.length > 0) {
      decision.logic.rules[0].outputEntries = ['"CHANGED"'];
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    expect(modifiedDec.ruleDiffs).toBeDefined();

    const modifiedRule = modifiedDec.ruleDiffs.find((r) => r.status === 'modified');
    expect(modifiedRule).toBeDefined();
  });

  it('detects changed hit policy', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable') {
      dec.logic.hitPolicy = 'FIRST';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const hitPolicyChange = modifiedDec.changes.find((c) => c.field === 'hitPolicy');
    expect(hitPolicyChange).toBeDefined();
    expect(hitPolicyChange.right).toBe('FIRST');
  });

  it('detects changed literal expression', async () => {
    const xml = loadFixture('literal-expression.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'literalExpression') {
      dec.logic.expression = 'x * 2 + 1';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const exprChange = modifiedDec.changes.find((c) => c.field === 'expression');
    expect(exprChange).toBeDefined();
    expect(exprChange.right).toBe('x * 2 + 1');
  });

  it('correctly counts summary statistics', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model = await parseDmnXml(xml);

    const diff = compareModels(model, model);

    const total =
      diff.summary.added + diff.summary.removed + diff.summary.modified + diff.summary.unchanged;
    expect(total).toBe(diff.decisions.length);
  });

  it('detects added rules', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable') {
      dec.logic.rules.push({
        id: 'new-rule',
        inputEntries: ['>= 100'],
        outputEntries: ['"centenarian"'],
      });
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const addedRule = modifiedDec.ruleDiffs.find((r) => r.status === 'added');
    expect(addedRule).toBeDefined();
    expect(addedRule.rightOutputEntries).toEqual(['"centenarian"']);
  });

  it('detects removed rules', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable') {
      dec.logic.rules.pop();
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const removedRule = modifiedDec.ruleDiffs.find((r) => r.status === 'removed');
    expect(removedRule).toBeDefined();
  });

  it('handles comparison between decision table and literal expression', async () => {
    const dtXml = loadFixture('simple-decision.dmn');
    const leXml = loadFixture('literal-expression.dmn');

    const dtModel = await parseDmnXml(dtXml);
    const leModel = await parseDmnXml(leXml);

    // These have different decision IDs so they'll show as added/removed
    const diff = compareModels(dtModel, leModel);

    expect(diff.decisions.length).toBeGreaterThan(0);
    // Each decision from dtModel not in leModel is "removed" and vice versa
    expect(diff.summary.added + diff.summary.removed).toBeGreaterThan(0);
  });

  it('sorts decisions: modified, added, removed, unchanged', async () => {
    const xml = loadFixture('drg-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    // Modify one decision
    const firstDec = model2.decisions.values().next().value;
    if (firstDec.logic?.type === 'decisionTable') {
      firstDec.logic.hitPolicy = 'FIRST';
    }

    const diff = compareModels(model1, model2);

    // Verify modified decisions come first
    const modifiedIdx = diff.decisions.findIndex((d) => d.status === 'modified');
    const unchangedIdx = diff.decisions.findIndex((d) => d.status === 'unchanged');
    if (modifiedIdx >= 0 && unchangedIdx >= 0) {
      expect(modifiedIdx).toBeLessThan(unchangedIdx);
    }
  });

  it('detects changed aggregation', async () => {
    const xml = loadFixture('collect-sum-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable') {
      dec.logic.aggregation = 'MAX';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const aggChange = modifiedDec.changes.find((c) => c.field === 'aggregation');
    expect(aggChange).toBeDefined();
    expect(aggChange.right).toBe('MAX');
  });

  it('detects changed decision name', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    dec.name = 'Renamed Decision';

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const nameChange = modifiedDec.changes.find((c) => c.field === 'name');
    expect(nameChange).toBeDefined();
    expect(nameChange.right).toBe('Renamed Decision');
  });

  it('detects changed information requirements', async () => {
    const xml = loadFixture('drg-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    // Find the decision with dependencies and modify them
    for (const [, dec] of model2.decisions) {
      if (dec.informationRequirements.length > 0) {
        dec.informationRequirements = ['fake_decision'];
        break;
      }
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const reqChange = modifiedDec.changes.find((c) => c.field === 'informationRequirements');
    expect(reqChange).toBeDefined();
  });

  it('detects changed literal expression typeRef', async () => {
    const xml = loadFixture('literal-expression.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'literalExpression') {
      dec.logic.typeRef = 'string';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const typeRefChange = modifiedDec.changes.find((c) => c.field === 'typeRef');
    expect(typeRefChange).toBeDefined();
  });

  it('detects logic type change (decisionTable to literalExpression)', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    dec.logic = { type: 'literalExpression', expression: 'x + 1', id: 'le1' };

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const logicChange = modifiedDec.changes.find((c) => c.field === 'logicType');
    expect(logicChange).toBeDefined();
    expect(logicChange.left).toBe('decisionTable');
    expect(logicChange.right).toBe('literalExpression');
  });

  it('detects input definition changes', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable' && dec.logic.inputs.length > 0) {
      dec.logic.inputs[0].expression = 'newExpression';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const inputChange = modifiedDec.changes.find((c) => c.field === 'inputs');
    expect(inputChange).toBeDefined();
  });

  it('detects output definition changes', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = await parseDmnXml(xml);

    const dec = model2.decisions.values().next().value;
    if (dec.logic?.type === 'decisionTable' && dec.logic.outputs.length > 0) {
      dec.logic.outputs[0].typeRef = 'integer';
    }

    const diff = compareModels(model1, model2);

    const modifiedDec = diff.decisions.find((d) => d.status === 'modified');
    expect(modifiedDec).toBeDefined();
    const outputChange = modifiedDec.changes.find((c) => c.field === 'outputs');
    expect(outputChange).toBeDefined();
  });

  it('includes rule diffs for added decision with decision table', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = { decisions: new Map() }; // empty
    const model2 = await parseDmnXml(xml);

    const diff = compareModels(model1, model2);

    const addedDec = diff.decisions.find((d) => d.status === 'added');
    expect(addedDec).toBeDefined();
    expect(addedDec.ruleDiffs).toBeDefined();
    addedDec.ruleDiffs.forEach((rd) => {
      expect(rd.status).toBe('added');
      expect(rd.rightInputEntries).toBeDefined();
      expect(rd.rightOutputEntries).toBeDefined();
    });
  });

  it('includes rule diffs for removed decision with decision table', async () => {
    const xml = loadFixture('simple-decision.dmn');
    const model1 = await parseDmnXml(xml);
    const model2 = { decisions: new Map() }; // empty

    const diff = compareModels(model1, model2);

    const removedDec = diff.decisions.find((d) => d.status === 'removed');
    expect(removedDec).toBeDefined();
    expect(removedDec.ruleDiffs).toBeDefined();
    removedDec.ruleDiffs.forEach((rd) => {
      expect(rd.status).toBe('removed');
      expect(rd.leftInputEntries).toBeDefined();
      expect(rd.leftOutputEntries).toBeDefined();
    });
  });
});
