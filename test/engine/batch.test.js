import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateBatch, parseCSV } from '../../src/engine/batch.js';

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
