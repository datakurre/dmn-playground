/**
 * Golden-file tests — compare engine output against Operaton-expected results.
 *
 * Each golden file (*.golden.json) defines a DMN fixture, a decision ID, and
 * a set of test cases with input data and expected outputs. The expected values
 * represent what the Operaton BPM engine (Camunda 7.24) would produce for the
 * same DMN model and inputs.
 *
 * This ensures our JS DMN engine stays compatible with Operaton's evaluation
 * behavior across all hit policies, DRG resolution, literal expressions, and
 * multi-output decision tables.
 *
 * To add new golden-file tests:
 *   1. Create a .golden.json file in test/fixtures/golden/
 *   2. Define the fixture, decisionId, and cases array
 *   3. The test runner picks it up automatically
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateDecision } from '../../src/engine/evaluate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');
const goldenDir = resolve(fixturesDir, 'golden');

function loadFixture(name) {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

function loadGoldenFiles() {
  const files = readdirSync(goldenDir).filter((f) => f.endsWith('.golden.json'));
  return files.map((f) => {
    const content = readFileSync(resolve(goldenDir, f), 'utf-8');
    return { filename: f, ...JSON.parse(content) };
  });
}

// ─── Run golden-file tests ─────────────────────────────────────────

const goldenFiles = loadGoldenFiles();

describe('Golden-file tests (Operaton compatibility)', () => {
  for (const golden of goldenFiles) {
    describe(`${golden.fixture} — ${golden.description}`, () => {
      for (const testCase of golden.cases) {
        it(`${testCase.name}`, async () => {
          const model = await parseDmnXml(loadFixture(golden.fixture));
          const { result, error } = evaluateDecision(model, golden.decisionId, testCase.input);

          if (testCase.expectedError) {
            expect(error).toBeDefined();
            expect(error).toContain(testCase.expectedError);
          } else {
            expect(error).toBeUndefined();
            expect(result).toEqual(testCase.expected);
          }
        });
      }
    });
  }
});
