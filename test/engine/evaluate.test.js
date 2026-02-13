import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateDecision } from '../../src/engine/evaluate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

describe('Decision Table Evaluation', () => {
  describe('UNIQUE hit policy', () => {
    it('matches the correct rule for a child', async () => {
      const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
      const { result, trace, error } = evaluateDecision(model, 'decision_age', { age: 10 });

      expect(error).toBeUndefined();
      expect(result).toBe('child');
      expect(trace).toHaveLength(1);
      expect(trace[0].matchedRules).toHaveLength(1);
    });

    it('matches the correct rule for a teenager', async () => {
      const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_age', { age: 15 });
      expect(result).toBe('teenager');
    });

    it('matches the correct rule for an adult', async () => {
      const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_age', { age: 30 });
      expect(result).toBe('adult');
    });

    it('matches the boundary value (18 = adult)', async () => {
      const model = await parseDmnXml(loadFixture('simple-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_age', { age: 18 });
      expect(result).toBe('adult');
    });
  });

  describe('COLLECT + SUM', () => {
    it('sums discounts for VIP with large order', async () => {
      const model = await parseDmnXml(loadFixture('collect-sum-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_discount', {
        customerType: 'VIP',
        orderAmount: 2000,
      });
      // VIP (10) + large order >1000 (5) = 15
      expect(result).toBe(15);
    });

    it('sums discounts for VIP with huge order', async () => {
      const model = await parseDmnXml(loadFixture('collect-sum-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_discount', {
        customerType: 'VIP',
        orderAmount: 6000,
      });
      // VIP (10) + large order >1000 (5) + huge order >5000 (3) = 18
      expect(result).toBe(18);
    });

    it('returns only large-order discount for regular customer', async () => {
      const model = await parseDmnXml(loadFixture('collect-sum-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_discount', {
        customerType: 'Regular',
        orderAmount: 2000,
      });
      // Only large order >1000 (5)
      expect(result).toBe(5);
    });

    it('returns 0 when no rules match', async () => {
      const model = await parseDmnXml(loadFixture('collect-sum-decision.dmn'));
      const { result } = evaluateDecision(model, 'decision_discount', {
        customerType: 'Regular',
        orderAmount: 500,
      });
      // No rules match
      expect(result).toBe(0);
    });
  });

  describe('Literal Expression', () => {
    it('evaluates a literal expression with context', async () => {
      const model = await parseDmnXml(loadFixture('literal-expression.dmn'));
      const { result, error } = evaluateDecision(model, 'decision_calc', {
        price: 100,
        quantity: 5,
        discountRate: 0.1,
      });

      expect(error).toBeUndefined();
      // 100 * 5 * (1 - 0.1) = 450
      expect(result).toBe(450);
    });
  });
});

describe('DRG Evaluation', () => {
  it('evaluates dependent decisions in order', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const { result, trace, error } = evaluateDecision(model, 'decision_rate', {
      income: 50000,
    });

    expect(error).toBeUndefined();
    // income 50000 → risk "medium" → rate 10.0
    expect(trace).toHaveLength(2);
    expect(trace[0].decisionId).toBe('decision_risk');
    expect(trace[1].decisionId).toBe('decision_rate');
    expect(result).toBe(10.0);
  });

  it('evaluates high-risk path', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const { result } = evaluateDecision(model, 'decision_rate', { income: 20000 });
    expect(result).toBe(15.0);
  });

  it('evaluates low-risk path', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const { result } = evaluateDecision(model, 'decision_rate', { income: 100000 });
    expect(result).toBe(5.0);
  });
});

describe('What-if Overrides', () => {
  it('uses override value instead of evaluating a decision', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    // Override the risk decision to return "low" regardless of income
    const { result, trace, error } = evaluateDecision(
      model,
      'decision_rate',
      { income: 20000 },
      { overrides: { decision_risk: 'low' } },
    );

    expect(error).toBeUndefined();
    // Without override, income 20000 → "high" → 15.0
    // With override "low" → 5.0
    expect(result).toBe(5.0);
    expect(trace).toHaveLength(2);
    expect(trace[0].type).toBe('override');
    expect(trace[0].result).toBe('low');
    expect(trace[1].decisionId).toBe('decision_rate');
  });

  it('override makes the value available in context by decision name', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const { result } = evaluateDecision(
      model,
      'decision_rate',
      { income: 20000 },
      { overrides: { decision_risk: 'medium' } },
    );
    expect(result).toBe(10.0);
  });

  it('ignores override for non-existent decisions', async () => {
    const model = await parseDmnXml(loadFixture('drg-decision.dmn'));
    const { result, error } = evaluateDecision(
      model,
      'decision_rate',
      { income: 50000 },
      { overrides: { nonexistent: 'foo' } },
    );
    expect(error).toBeUndefined();
    expect(result).toBe(10.0);
  });
});
