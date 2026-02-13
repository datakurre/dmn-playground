/**
 * Cross-provider tests — compare FEEL evaluation results across providers.
 *
 * These tests run the same FEEL expressions and unary tests through all
 * available FEEL providers and compare outputs. Both feelin and feel-scala
 * are tested to ensure they produce identical results.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { FeelinProvider } from '../../src/engine/feel/feelin.js';
import { FeelScalaProvider } from '../../src/engine/feel/feel-scala.js';
import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateDecision } from '../../src/engine/evaluate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

// ─── Test data ──────────────────────────────────────────────────────

const expressionTests = [
  { expr: '1 + 2', context: {}, expected: 3 },
  { expr: '10 * 3 + 5', context: {}, expected: 35 },
  { expr: 'x + y', context: { x: 10, y: 20 }, expected: 30 },
  { expr: '"hello"', context: {}, expected: 'hello' },
  { expr: 'true', context: {}, expected: true },
  { expr: 'false', context: {}, expected: false },
  { expr: 'if x > 5 then "high" else "low"', context: { x: 10 }, expected: 'high' },
  { expr: 'if x > 5 then "high" else "low"', context: { x: 3 }, expected: 'low' },
];

const unaryTests = [
  { expr: '> 5', input: 10, expected: true },
  { expr: '> 5', input: 3, expected: false },
  { expr: '< 18', input: 10, expected: true },
  { expr: '< 18', input: 20, expected: false },
  { expr: '"A"', input: 'A', expected: true },
  { expr: '"A"', input: 'B', expected: false },
  { expr: '-', input: 42, expected: true },
  { expr: '', input: 42, expected: true },
  { expr: '[1..10]', input: 5, expected: true },
  { expr: '[1..10]', input: 15, expected: false },
];

const decisionTests = [
  {
    fixture: 'simple-decision.dmn',
    decisionId: 'decision_age',
    inputs: { age: 10 },
    expected: 'child',
  },
  {
    fixture: 'simple-decision.dmn',
    decisionId: 'decision_age',
    inputs: { age: 15 },
    expected: 'teenager',
  },
  {
    fixture: 'simple-decision.dmn',
    decisionId: 'decision_age',
    inputs: { age: 30 },
    expected: 'adult',
  },
  {
    fixture: 'collect-sum-decision.dmn',
    decisionId: 'decision_discount',
    inputs: { customerType: 'VIP', orderAmount: 2000 },
    expected: 15,
  },
  {
    fixture: 'literal-expression.dmn',
    decisionId: 'decision_calc',
    inputs: { price: 100, quantity: 5, discountRate: 0.1 },
    expected: 450,
  },
  {
    fixture: 'drg-decision.dmn',
    decisionId: 'decision_rate',
    inputs: { income: 50000 },
    expected: 10.0,
  },
];

// ─── Helper: run all test suites for a single provider ─────────────

function defineProviderTests(providerName, getProvider) {
  describe(`Cross-provider: ${providerName}`, () => {
    /** @type {import('../../src/engine/feel/provider.js').FeelProvider} */
    let provider;

    beforeAll(async () => {
      provider = await getProvider();
    });

    describe('FEEL expressions', () => {
      for (const test of expressionTests) {
        it(`evaluates "${test.expr}" → ${JSON.stringify(test.expected)}`, () => {
          const result = provider.evaluate(test.expr, test.context);
          expect(result).toEqual(test.expected);
        });
      }
    });

    describe('FEEL unary tests', () => {
      for (const test of unaryTests) {
        const exprLabel = test.expr || '(empty)';
        it(`unaryTest("${exprLabel}", ${test.input}) → ${test.expected}`, () => {
          const result = provider.unaryTest(test.expr, test.input);
          expect(result).toBe(test.expected);
        });
      }
    });

    describe('Decision evaluation', () => {
      for (const test of decisionTests) {
        it(`${test.fixture} / ${test.decisionId} → ${JSON.stringify(test.expected)}`, async () => {
          const model = await parseDmnXml(loadFixture(test.fixture));
          const { result, error } = evaluateDecision(model, test.decisionId, test.inputs, {
            feelProvider: provider,
          });

          expect(error).toBeUndefined();
          expect(result).toEqual(test.expected);
        });
      }
    });
  });
}

// ─── Define tests for each provider ────────────────────────────────

defineProviderTests('feelin', async () => new FeelinProvider());

defineProviderTests('feel-scala', async () => {
  const provider = new FeelScalaProvider();
  await provider.initialize();
  return provider;
});
