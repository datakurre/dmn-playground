/**
 * Cross-provider tests — compare FEEL evaluation results across providers.
 *
 * These tests run the same FEEL expressions and unary tests through all
 * available FEEL providers and compare outputs. When feel-scala becomes
 * available, any divergences between providers will be flagged.
 *
 * For now, only feelin is available, so these tests establish the baseline
 * expectations. When feel-scala is added, the tests will automatically
 * include it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { FeelinProvider } from '../../src/engine/feel/feelin.js';
import { getAvailableProviders } from '../../src/engine/feel/registry.js';
import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateDecision } from '../../src/engine/evaluate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

/**
 * Get all available provider instances for cross-testing.
 * Currently only feelin; feel-scala will be added when available.
 */
function getTestProviders() {
  const providers = [new FeelinProvider()];

  // When feel-scala is available, add it here:
  // const scalaProviders = getAvailableProviders().filter(p => p.name === 'feel-scala' && p.available);
  // if (scalaProviders.length > 0) { providers.push(await getProvider('feel-scala')); }

  return providers;
}

// ─── FEEL Expression Evaluation ─────────────────────────────────────

describe('Cross-provider: FEEL expressions', () => {
  const providers = getTestProviders();

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

  for (const provider of providers) {
    describe(`Provider: ${provider.name}`, () => {
      for (const test of expressionTests) {
        it(`evaluates "${test.expr}" → ${JSON.stringify(test.expected)}`, () => {
          const result = provider.evaluate(test.expr, test.context);
          expect(result).toEqual(test.expected);
        });
      }
    });
  }
});

// ─── FEEL Unary Tests ──────────────────────────────────────────────

describe('Cross-provider: FEEL unary tests', () => {
  const providers = getTestProviders();

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

  for (const provider of providers) {
    describe(`Provider: ${provider.name}`, () => {
      for (const test of unaryTests) {
        const exprLabel = test.expr || '(empty)';
        it(`unaryTest("${exprLabel}", ${test.input}) → ${test.expected}`, () => {
          const result = provider.unaryTest(test.expr, test.input);
          expect(result).toBe(test.expected);
        });
      }
    });
  }
});

// ─── End-to-end decision evaluation across providers ───────────────

describe('Cross-provider: Decision evaluation', () => {
  const providers = getTestProviders();

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

  for (const provider of providers) {
    describe(`Provider: ${provider.name}`, () => {
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
  }
});

// ─── Divergence documentation ──────────────────────────────────────

describe('Cross-provider: Known divergences', () => {
  // This section documents known differences between feelin and feel-scala.
  // As divergences are discovered, add test cases here with comments explaining
  // the expected behavior difference and which engine is "correct" per the spec.

  it('placeholder — no divergences documented yet (feel-scala not yet available)', () => {
    const providers = getAvailableProviders();
    const scalaAvailable = providers.find((p) => p.name === 'feel-scala' && p.available);
    // Once feel-scala is available, this test should be replaced with
    // actual divergence documentation tests.
    expect(scalaAvailable).toBeUndefined();
  });
});
