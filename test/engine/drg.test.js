import { describe, it, expect } from 'vitest';

import { resolveEvaluationOrder, getDependencies } from '../../src/engine/drg.js';

describe('DRG Resolver', () => {
  function makeModel(decisionsMap) {
    const decisions = new Map();
    for (const [id, deps] of Object.entries(decisionsMap)) {
      decisions.set(id, {
        id,
        name: id,
        logic: { type: 'decisionTable' },
        informationRequirements: deps,
      });
    }
    return { decisions };
  }

  describe('resolveEvaluationOrder()', () => {
    it('returns single decision with no dependencies', () => {
      const model = makeModel({ A: [] });
      const order = resolveEvaluationOrder(model, 'A');
      expect(order).toEqual(['A']);
    });

    it('resolves a linear dependency chain', () => {
      const model = makeModel({
        A: [],
        B: ['A'],
        C: ['B'],
      });
      const order = resolveEvaluationOrder(model, 'C');
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('resolves a diamond dependency', () => {
      const model = makeModel({
        A: [],
        B: ['A'],
        C: ['A'],
        D: ['B', 'C'],
      });
      const order = resolveEvaluationOrder(model, 'D');
      expect(order).toContain('A');
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    });

    it('detects circular dependencies', () => {
      const model = makeModel({
        A: ['B'],
        B: ['A'],
      });
      expect(() => resolveEvaluationOrder(model, 'A')).toThrow(/[Cc]ircular/);
    });

    it('resolves all decisions when no target specified', () => {
      const model = makeModel({
        A: [],
        B: ['A'],
        C: [],
      });
      const order = resolveEvaluationOrder(model);
      expect(order).toHaveLength(3);
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    });
  });

  describe('getDependencies()', () => {
    it('returns empty array for a decision with no dependencies', () => {
      const model = makeModel({ A: [] });
      expect(getDependencies(model, 'A')).toEqual([]);
    });

    it('returns all transitive dependencies', () => {
      const model = makeModel({
        A: [],
        B: ['A'],
        C: ['B'],
      });
      expect(getDependencies(model, 'C')).toEqual(['A', 'B']);
    });
  });

  describe('Error handling', () => {
    it('throws for non-existent decision in resolveForDecision', () => {
      const model = makeModel({ A: [] });
      expect(() => resolveEvaluationOrder(model, 'nonexistent')).toThrow('Decision not found');
    });

    it('throws for non-existent decision in resolveAll when referenced as dependency', () => {
      // B references C which doesn't exist
      const decisions = new Map();
      decisions.set('B', {
        id: 'B',
        name: 'B',
        logic: { type: 'decisionTable' },
        informationRequirements: ['C'],
      });
      const model = { decisions };
      expect(() => resolveEvaluationOrder(model)).toThrow('Decision not found');
    });

    it('detects circular dependency in resolveAll', () => {
      const model = makeModel({
        X: ['Y'],
        Y: ['Z'],
        Z: ['X'],
      });
      expect(() => resolveEvaluationOrder(model)).toThrow(/[Cc]ircular/);
    });

    it('detects self-referential circular dependency', () => {
      const model = makeModel({ A: ['A'] });
      expect(() => resolveEvaluationOrder(model, 'A')).toThrow(/[Cc]ircular/);
    });
  });
});
