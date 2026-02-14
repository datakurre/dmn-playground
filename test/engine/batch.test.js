import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateBatch, parseCSV, aggregateBatchResults } from '../../src/engine/batch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

describe('Batch Evaluation', () => {
  it('evaluates multiple input rows', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }, { age: 15 }, { age: 30 }];

    const results = evaluateBatch(model, 'decision_age', rows);

    expect(results).toHaveLength(3);
    expect(results[0].result).toBe('child');
    expect(results[1].result).toBe('teenager');
    expect(results[2].result).toBe('adult');
  });

  it('includes index in each result', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }, { age: 30 }];

    const results = evaluateBatch(model, 'decision_age', rows);

    expect(results[0].index).toBe(0);
    expect(results[1].index).toBe(1);
  });

  it('captures errors per row without stopping batch', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    // Valid row, then row that may produce no match (no error, just null)
    const rows = [{ age: 10 }, { age: -1 }];

    const results = evaluateBatch(model, 'decision_age', rows);

    expect(results).toHaveLength(2);
    expect(results[0].result).toBe('child');
    // age -1 matches "< 13" rule → "child"
    expect(results[1].result).toBe('child');
  });

  it('returns empty array for empty input', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const results = evaluateBatch(model, 'decision_age', []);
    expect(results).toEqual([]);
  });

  it('preserves input data in each result row', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 25 }];

    const results = evaluateBatch(model, 'decision_age', rows);

    expect(results[0].inputData).toEqual({ age: 25 });
  });

  it('includes trace in each result row', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }];

    const results = evaluateBatch(model, 'decision_age', rows);

    expect(results[0].trace).toHaveLength(1);
    expect(results[0].trace[0].decisionId).toBe('decision_age');
  });

  it('passes options through to evaluateDecision', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const rows = [{ income: 20000 }];

    // Use override to change the risk to "low"
    const results = evaluateBatch(model, 'decision_rate', rows, {
      overrides: { decision_risk: 'low' },
    });

    expect(results[0].result).toBe(5.0);
  });

  it('captures errors for rows that throw during evaluation', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    // Evaluate against a non-existent decision to trigger an error per row
    const rows = [{ age: 10 }];
    const results = evaluateBatch(model, 'nonexistent', rows);

    expect(results).toHaveLength(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].result).toBe(null);
  });
});

describe('CSV Parsing', () => {
  it('parses basic CSV with headers', () => {
    const csv = 'age,name\n25,Alice\n30,Bob';
    const rows = parseCSV(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ age: 25, name: 'Alice' });
    expect(rows[1]).toEqual({ age: 30, name: 'Bob' });
  });

  it('auto-coerces numbers', () => {
    const csv = 'value\n42\n3.14\n-7';
    const rows = parseCSV(csv);

    expect(rows[0].value).toBe(42);
    expect(rows[1].value).toBe(3.14);
    expect(rows[2].value).toBe(-7);
  });

  it('auto-coerces booleans', () => {
    const csv = 'flag\ntrue\nfalse\nTRUE';
    const rows = parseCSV(csv);

    expect(rows[0].flag).toBe(true);
    expect(rows[1].flag).toBe(false);
    expect(rows[2].flag).toBe(true);
  });

  it('treats empty values as undefined', () => {
    const csv = 'a,b\n1,\n,2';
    const rows = parseCSV(csv);

    expect(rows[0]).toEqual({ a: 1, b: undefined });
    expect(rows[1]).toEqual({ a: undefined, b: 2 });
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,value\n"Smith, John",42\nJane,10';
    const rows = parseCSV(csv);

    expect(rows[0]).toEqual({ name: 'Smith, John', value: 42 });
    expect(rows[1]).toEqual({ name: 'Jane', value: 10 });
  });

  it('handles escaped quotes in fields', () => {
    const csv = 'text\n"He said ""hello"""\nplain';
    const rows = parseCSV(csv);

    expect(rows[0].text).toBe('He said "hello"');
    expect(rows[1].text).toBe('plain');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCSV('a,b')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles Windows-style line endings', () => {
    const csv = 'age\r\n25\r\n30';
    const rows = parseCSV(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0].age).toBe(25);
    expect(rows[1].age).toBe(30);
  });

  it('coerces null string to null', () => {
    const csv = 'val\nnull';
    const rows = parseCSV(csv);
    expect(rows[0].val).toBe(null);
  });
});

describe('aggregateBatchResults', () => {
  it('returns empty summary for null input', () => {
    const agg = aggregateBatchResults(null);
    expect(agg.totalRows).toBe(0);
    expect(agg.successRows).toBe(0);
    expect(agg.failedRows).toBe(0);
    expect(agg.decisions).toEqual([]);
  });

  it('returns empty summary for empty array', () => {
    const agg = aggregateBatchResults([]);
    expect(agg.totalRows).toBe(0);
    expect(agg.decisions).toEqual([]);
  });

  it('counts total, success, and failed rows', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }, { age: 20 }, { age: 15 }];
    const results = evaluateBatch(model, 'decision_age', rows);

    const agg = aggregateBatchResults(results);

    expect(agg.totalRows).toBe(3);
    expect(agg.successRows).toBe(3);
    expect(agg.failedRows).toBe(0);
  });

  it('counts failed rows from error results', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }];
    // Evaluate against a non-existent decision to produce errors
    const results = evaluateBatch(model, 'nonexistent', rows);

    const agg = aggregateBatchResults(results);

    expect(agg.totalRows).toBe(1);
    expect(agg.failedRows).toBe(1);
    expect(agg.successRows).toBe(0);
  });

  it('aggregates per-decision evaluation counts', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const rows = [{ income: 20000 }, { income: 50000 }, { income: 80000 }];
    const results = evaluateBatch(model, 'decision_rate', rows);

    const agg = aggregateBatchResults(results);

    // DRG has two decisions: decision_risk and decision_rate
    expect(agg.decisions).toHaveLength(2);

    const riskAgg = agg.decisions.find((d) => d.decisionId === 'decision_risk');
    const rateAgg = agg.decisions.find((d) => d.decisionId === 'decision_rate');

    expect(riskAgg).toBeDefined();
    expect(rateAgg).toBeDefined();

    // Each decision should be evaluated once per batch row
    expect(riskAgg.evaluatedCount).toBe(3);
    expect(rateAgg.evaluatedCount).toBe(3);
  });

  it('tracks rule match frequency (heatmap)', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    // age < 13 → child (rule 0), [13..17] → teenager (rule 1), >= 18 → adult (rule 2)
    const rows = [
      { age: 5 }, // rule 0
      { age: 10 }, // rule 0
      { age: 15 }, // rule 1
      { age: 25 }, // rule 2
      { age: 30 }, // rule 2
      { age: 35 }, // rule 2
    ];
    const results = evaluateBatch(model, 'decision_age', rows);
    const agg = aggregateBatchResults(results);

    expect(agg.decisions).toHaveLength(1);
    const dec = agg.decisions[0];

    expect(dec.ruleMatchFrequency.get(0)).toBe(2); // child matched 2 times
    expect(dec.ruleMatchFrequency.get(1)).toBe(1); // teenager matched 1 time
    expect(dec.ruleMatchFrequency.get(2)).toBe(3); // adult matched 3 times
  });

  it('identifies unmatched rules', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    // Only trigger rule 0 (child) — rules 1 and 2 are never matched
    const rows = [{ age: 5 }, { age: 8 }, { age: 12 }];
    const results = evaluateBatch(model, 'decision_age', rows);
    const agg = aggregateBatchResults(results);

    const dec = agg.decisions[0];

    // Only rule index 0 was matched
    expect(dec.ruleMatchFrequency.has(0)).toBe(true);
    expect(dec.ruleMatchFrequency.has(1)).toBe(false);
    expect(dec.ruleMatchFrequency.has(2)).toBe(false);

    // totalRules is determined from the max matched index + 1
    // Since only rule 0 matched, totalRules = 1
    // unmatchedRules within the known range
    expect(dec.unmatchedRules).toEqual([]);
  });

  it('tracks unmatched rules across all matched indices', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    // Trigger rule 0 and rule 2, but not rule 1
    const rows = [
      { age: 5 }, // rule 0
      { age: 25 }, // rule 2
    ];
    const results = evaluateBatch(model, 'decision_age', rows);
    const agg = aggregateBatchResults(results);

    const dec = agg.decisions[0];

    expect(dec.totalRules).toBe(3); // max index is 2, so 3 rules known
    expect(dec.unmatchedRules).toEqual([1]); // rule 1 never matched
  });

  it('preserves decision type information', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }];
    const results = evaluateBatch(model, 'decision_age', rows);
    const agg = aggregateBatchResults(results);

    expect(agg.decisions[0].type).toBe('decisionTable');
  });

  it('tracks error count per decision', async () => {
    const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
    const rows = [{ age: 10 }];
    const results = evaluateBatch(model, 'decision_age', rows);
    const agg = aggregateBatchResults(results);

    expect(agg.decisions[0].errorCount).toBe(0);
  });

  it('aggregates DRG decisions with rule frequency across decisions', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const rows = [
      { income: 20000 }, // risk: high → rate: 15.0
      { income: 50000 }, // risk: medium → rate: 10.0
      { income: 80000 }, // risk: low → rate: 5.0
      { income: 10000 }, // risk: high → rate: 15.0
    ];
    const results = evaluateBatch(model, 'decision_rate', rows);
    const agg = aggregateBatchResults(results);

    const riskAgg = agg.decisions.find((d) => d.decisionId === 'decision_risk');

    // rule 0 (high risk) matched 2 times, rule 1 (medium) 1 time, rule 2 (low) 1 time
    expect(riskAgg.ruleMatchFrequency.get(0)).toBe(2);
    expect(riskAgg.ruleMatchFrequency.get(1)).toBe(1);
    expect(riskAgg.ruleMatchFrequency.get(2)).toBe(1);
  });

  it('handles rows with missing trace gracefully', () => {
    const results = [
      { index: 0, inputData: {}, result: null, trace: undefined, error: 'bad' },
      { index: 1, inputData: {}, result: null, trace: [], error: 'bad' },
    ];
    const agg = aggregateBatchResults(results);

    expect(agg.totalRows).toBe(2);
    expect(agg.failedRows).toBe(2);
    expect(agg.decisions).toEqual([]);
  });

  it('handles overrides in trace entries', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const rows = [{ income: 20000 }];
    const results = evaluateBatch(model, 'decision_rate', rows, {
      overrides: { decision_risk: 'low' },
    });
    const agg = aggregateBatchResults(results);

    const riskAgg = agg.decisions.find((d) => d.decisionId === 'decision_risk');
    expect(riskAgg.type).toBe('override');
    expect(riskAgg.evaluatedCount).toBe(1);
    // Overrides have no matched rules
    expect(riskAgg.ruleMatchFrequency.size).toBe(0);
  });
});
